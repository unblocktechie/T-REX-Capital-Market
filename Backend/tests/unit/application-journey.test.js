const test = require('node:test');
const assert = require('node:assert/strict');
const { ApplicationJourneyService } = require('../../src/services/application-journey.service');
const { ClaimRecoveryService } = require('../../src/services/blockchain/claim-recovery.service');

function setup({ signed = true, claims = false, registry = false, status = 'verifiedByIssuer' } = {}) {
  const state = { signed, claims, registry, interest: {interestUid:'i',tokenUid:'t',investorUid:'v',organizationUid:'o',status}, history:[] };
  const interestRepository = {
    findInterestForUpdate: async () => ({...state.interest}),
    transitionInterestStatus: async (id, from, to) => {
      if(state.interest.status!==from) return false;
      state.interest.status=to; return true;
    },
    createHistory: async row => state.history.push(row),
  };
  const registryRepository = {
    getIssuerClaimCompletion: async () => ({required:2,missing:state.signed?[]:[1]}),
    getClaimCompletion: async () => ({required:2,missing:state.claims?[]:[1]}),
    findByInterest: async () => ({status:state.registry?'CONFIRMED':'PENDING'}),
    listJourneyCandidates: async chainId => {assert.equal(chainId,11155111);return [{...state.interest}];},
  };
  const service = new ApplicationJourneyService({registryRepository,interestRepository});
  return {state,service,interestRepository};
}

test('progress matrix keeps issuer stages pending and never completes on registry alone', async () => {
  for(const [signed,registry,claims,stage] of [
    [false,false,false,'PENDING'],[true,false,false,'PENDING'],
    [true,true,false,'AWAITING_INVESTOR_CLAIMS'],[true,true,true,'COMPLETED'],
    [true,false,true,'PENDING'],[false,true,true,'PENDING'],
  ]){
    const {state,service}=setup({signed,registry,claims});
    const result=await service.synchronize(state.interest,{});
    assert.equal(result.journeyStage,stage);
    assert.equal(result.status,stage==='COMPLETED'?'registered':'verifiedByIssuer');
    assert.equal(result.canInvest,stage==='COMPLETED');
  }
});

test('rejected or withdrawn application cannot become investable despite confirmed historical records', async () => {
  const {state,service}=setup({signed:true,registry:true,claims:true,status:'rejected'});
  const result=await service.synchronize(state.interest,{});
  assert.equal(result.canInvest,false); assert.equal(state.history.length,0);
});

test('recovery uses the same completion rule and repeated completion is idempotent', async () => {
  const {state,service,interestRepository}=setup({registry:true,claims:true});
  const recovery=new ClaimRecoveryService({journeyService:service,interestRepository, config:{},
    transactionRunner:work=>work({})});
  await recovery.finalizeInterestIfComplete(state.interest);
  await recovery.finalizeInterestIfComplete(state.interest);
  assert.equal(state.interest.status,'registered'); assert.equal(state.history.length,1);
});

test('periodic reconciliation completes application after a crash following confirmed DB writes', async () => {
  const {state,service}=setup({registry:true,claims:true});
  await service.reconcile(11155111,work=>work({}));
  assert.equal(state.interest.status,'registered'); assert.equal(state.history.length,1);
  await service.reconcile(11155111,work=>work({}));
  assert.equal(state.history.length,1);
});

test('legacy claims-first applications complete when registry confirmation is subsequently recovered', async () => {
  const {state,service}=setup({registry:true,claims:true,status:'claimSubmitted'});
  assert.equal((await service.synchronize(state.interest,{})).status,'registered');
});

test('two racing completion attempts emit only one completion history record', async () => {
  const {state,service}=setup({registry:true,claims:true});
  await Promise.all([service.synchronize({...state.interest},{}),service.synchronize({...state.interest},{})]);
  assert.equal(state.interest.status,'registered'); assert.equal(state.history.length,1);
});

test('claim recovery does not complete while issuer registration is still pending', async () => {
  const {state,service,interestRepository}=setup({registry:false,claims:true});
  const recovery=new ClaimRecoveryService({journeyService:service,interestRepository,config:{},transactionRunner:work=>work({})});
  await recovery.finalizeInterestIfComplete(state.interest);
  assert.equal(state.interest.status,'verifiedByIssuer'); assert.equal(state.history.length,0);
});
