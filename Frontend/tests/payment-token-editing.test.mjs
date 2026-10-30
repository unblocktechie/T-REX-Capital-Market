import test from 'node:test';
import assert from 'node:assert/strict';
import { mapTokenForm } from '../src/api/tokens/token.mapper.js';
import { useTokenIssuanceStore } from '../src/store/tokenIssuance.store.js';
const usdt='0x86B14D29A59b745bF08c42661322d13142d5eb49';
const usdc='0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const hydrate=(extra={})=>useTokenIssuanceStore.getState().hydrateFromBackend(mapTokenForm({data:{tokenUid:'draft-1',status:'draft',paymentTokenAddress:usdt,paymentTokenSymbol:'USDT',...extra},options:{},countries:[]}));
test('saved draft currency remains editable after backend hydration',()=>{
 hydrate(); const store=useTokenIssuanceStore.getState();
 assert.equal(store.supplyPricing.paymentTokenLocked,false);
 store.updateSection('supplyPricing',{paymentTokenAddress:usdc,currency:'USDC'});
 assert.equal(useTokenIssuanceStore.getState().supplyPricing.paymentTokenAddress,usdc);
});
test('creation lifecycle freezes currency while numeric price stays editable',()=>{
 for(const status of ['deployment_pending','deployed','active','configuration_failed']){
  hydrate({status});const store=useTokenIssuanceStore.getState();
  const originalController=useTokenIssuanceStore.getState().supplyPricing.controllerAddress;
  store.updateSection('supplyPricing',{paymentTokenAddress:usdc,controllerAddress:'0x3333333333333333333333333333333333333333',currency:'USDC',initialPrice:'20'});
  assert.equal(useTokenIssuanceStore.getState().supplyPricing.paymentTokenAddress,usdt,status);
  assert.equal(useTokenIssuanceStore.getState().supplyPricing.controllerAddress,originalController,status);
  assert.equal(useTokenIssuanceStore.getState().supplyPricing.initialPrice,'20');
 }
});
test('creation address locks even if backend status is stale',()=>{
 hydrate({tokenAddress:'0x1111111111111111111111111111111111111111'});
 assert.equal(useTokenIssuanceStore.getState().supplyPricing.paymentTokenLocked,true);
});
test('confirming creation locks current draft before transaction broadcast',()=>{
 hydrate();useTokenIssuanceStore.getState().setDeployment({status:'processing'});
 useTokenIssuanceStore.getState().updateSection('supplyPricing',{paymentTokenAddress:usdc,currency:'USDC'});
 assert.equal(useTokenIssuanceStore.getState().supplyPricing.paymentTokenAddress,usdt);
});

test('cancelled pre-broadcast creation restores editable draft like other setup fields',()=>{
 hydrate();useTokenIssuanceStore.getState().setDeployment({status:'processing'});
 useTokenIssuanceStore.getState().setBackendState({status:'draft',isLocked:false});
 useTokenIssuanceStore.getState().setDeployment({status:'error',transactionHash:'',result:null});
 useTokenIssuanceStore.getState().updateSection('supplyPricing',{paymentTokenAddress:usdc,currency:'USDC'});
 assert.equal(useTokenIssuanceStore.getState().supplyPricing.paymentTokenAddress,usdc);
});
test('broadcast transaction stays locked during recovery errors with stale draft status',()=>{
 for(const recovery of [{transactionHash:'0x'+'ab'.repeat(32)},{pendingSync:{transactionHash:'0x'+'ab'.repeat(32)}}]){
  hydrate();useTokenIssuanceStore.getState().setDeployment({status:'error',...recovery});
  useTokenIssuanceStore.getState().updateSection('supplyPricing',{paymentTokenAddress:usdc,currency:'USDC'});
  assert.equal(useTokenIssuanceStore.getState().supplyPricing.paymentTokenAddress,usdt);
 }
});
