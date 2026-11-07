const test = require('node:test');
const assert = require('node:assert/strict');
const { MultiChainBlockchainTransactionService } = require('../../src/services/blockchain/multi-chain-blockchain-transaction.service');
const { BlockchainTransactionService } = require('../../src/services/blockchain/blockchain-transaction.service');
const { createBlockchainTransactionController } = require('../../src/api/v1/controllers/blockchain-transaction.controller');

const hash = `0x${'ab'.repeat(32)}`;
function fixture(type, status = 'CONFIRMED') {
  const input = { chainId:1874, txHash:hash, tokenUid:'token-1', expectedAction:type };
  const user = {userUid:'user-1',roleName:type==='REDEMPTION'?'Issuer':'Investor'};
  const raw = {transactionUid:'tx-1',chainId:1874,tokenUid:'token-1',transactionHash:hash,
    status,type,tokenAmountFormatted:'123456789.123456789',tokenAmountRaw:'123456789123456789',
    paymentAmountFormatted:'12.5',blockNumber:11766398,internalOnly:'not exposed'};
  let confirmations = 0;
  let formats = 0;
  const service = new MultiChainBlockchainTransactionService({});
  const formatter = new BlockchainTransactionService({config:{chainId:1874,confirmations:7}});
  service.serviceFor = async chainId => {
    assert.equal(chainId,1874);
    return {
      confirm:async (actualUser,actualInput) => {
        assert.equal(actualUser,user); assert.equal(actualInput.txHash,hash);
        confirmations++; return raw;
      },
      present:row=>{assert.equal(row,raw);formats++;return formatter.present(row);},
      synchronize:async ()=>raw,
    };
  };
  const req = {id:'request-1',user,body:input,selectedChain:{chainId:1874,chainUid:'whitechain'}};
  const res = {status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
  return {service,raw,req,res,counts:()=>({confirmations,formats})};
}

for(const type of ['INVEST','TRANSFER','REDEMPTION']) {
  test(`${type} multichain confirmation returns the formatted response without a wrapper present method`, async()=>{
    const {service,req,res,counts}=fixture(type);
    assert.equal(service.present,undefined);
    await createBlockchainTransactionController(service).confirm(req,res);
    assert.equal(res.statusCode,200); assert.equal(res.body.success,true);
    assert.equal(res.body.data.type,type); assert.equal(res.body.data.status,'CONFIRMED');
    assert.equal(res.body.data.chainId,1874); assert.equal(res.body.data.requiredConfirmations,7);
    assert.equal(res.body.data.tokenAmount,'123456789.123456789');
    assert.equal(res.body.data.paymentAmount,'12.5'); assert.equal(res.body.data.internalOnly,undefined);
    assert.deepEqual(counts(),{confirmations:1,formats:1});
  });
}

for(const status of ['SUBMITTED','FAILED']) {
  test(`${status} response is preserved and does not claim success on-chain`,async()=>{
    const {service,req,res}=fixture('TRANSFER',status);
    await createBlockchainTransactionController(service).confirm(req,res);
    assert.equal(res.body.data.status,status);
    assert.match(res.body.message,status==='SUBMITTED'?/awaiting blockchain confirmations/:/failed/);
  });
}

test('chain mismatch is still rejected before verification',async()=>{
  const {service,req,res,counts}=fixture('TRANSFER'); req.body.chainId=1;
  await assert.rejects(createBlockchainTransactionController(service).confirm(req,res),e=>e.code==='SELECTED_CHAIN_MISMATCH');
  assert.deepEqual(counts(),{confirmations:0,formats:0});
});

test('verification errors propagate without formatting or a success response',async()=>{
  const {service,req,res}=fixture('TRANSFER');
  service.serviceFor=async()=>({confirm:async()=>{throw new Error('invalid receipt');},present:()=>assert.fail('must not format')});
  await assert.rejects(createBlockchainTransactionController(service).confirm(req,res),/invalid receipt/);
  assert.equal(res.body,undefined);
});

test('background synchronization retains its raw-record contract',async()=>{
  const {service,raw,req}=fixture('TRANSFER');
  assert.equal(await service.synchronize(req.body),raw);
});
