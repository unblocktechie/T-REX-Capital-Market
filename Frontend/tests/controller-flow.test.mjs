import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, decodeFunctionData } from 'viem';
import { quotePlatformPurchase, submitPlatformPurchase, submitPlatformRedemption, setPlatformTokenPrice, getPlatformTokenPrice, approvePlatformPurchaseSpending, TREX_PLATFORM_CONTROLLER_ABI } from '../src/services/blockchain/trexPlatformController.service.js';
import { investmentApi } from '../src/api/investments/investment.api.js';
import { setup, asset, pay, controller, issuer, investor, hash, input } from './controller-fixture.mjs';
test('buy encodes selected payment address and targets saved controller with 6/18 decimals',async()=>{
 for(const decimals of [6,18]){
  const s=setup({decimals});const q=await quotePlatformPurchase(input);
  assert.equal(q.priceFormatted,'12.345678');assert.equal(q.paymentAmountFormatted,'30.864195');
  await submitPlatformPurchase({...input,connector:s.connector,connectedAddress:investor,investorWalletAddress:investor,expectedPaymentAmountRaw:q.paymentAmount.toString()});
  const tx=s.writes.at(-1);assert.equal(tx.address,controller);
  assert.deepEqual(decodeFunctionData({abi:TREX_PLATFORM_CONTROLLER_ABI,data:encodeFunctionData(tx)}).args,[asset,pay,2500000000000000000n]);
  assert.equal(tx.value,undefined);
 }
});
test('redemption is issuer-signed and never approves the investor asset',async()=>{
 const s=setup({decimals:18,account:issuer});
 await submitPlatformRedemption({...input,connector:s.connector,connectedAddress:issuer,investorWalletAddress:investor});
 assert.equal(s.writes.length,1);assert.equal(s.writes[0].account,issuer);
 assert.deepEqual(s.writes[0].args,[investor,asset,pay,2500000000000000000n]);
});
test('missing asset controller recovers from the authoritative payment-token catalogue',async()=>{
 const s=setup();
 s.catalogue[0].platformControllerAddress=controller;
 const q=await quotePlatformPurchase({...input,controllerAddress:''});
 assert.equal(q.controller,controller);
});
test('missing controller everywhere and inactive currencies still stop purchases',async()=>{
 setup();await assert.rejects(quotePlatformPurchase({...input,controllerAddress:''}));
 const s=setup();s.catalogue[0].active=false;await assert.rejects(quotePlatformPurchase(input));assert.equal(s.writes.length,0);
});
test('legacy controller keeps old signature after payment-token getter verification',async()=>{
 const s=setup({legacy:true});await submitPlatformPurchase({...input,connector:s.connector,connectedAddress:investor,investorWalletAddress:investor});
 assert.deepEqual(s.writes[0].args,[asset,2500000000000000000n]);assert.equal(s.writes[0].address,controller);
});
test('price updates use controller precision even with an 18-decimal payment token',async()=>{
 const s=setup({decimals:18,account:issuer});s.catalogue[0].supportedActions=['REDEMPTION'];
 const result=await setPlatformTokenPrice({...input,connector:s.connector,connectedAddress:issuer,issuerWalletAddress:issuer,currentTokenPrice:'1.234567'});
 assert.equal(result.priceRaw,1234567n);assert.equal(result.currentTokenPrice,'1.234567');
 assert.equal((await getPlatformTokenPrice(input)).currentTokenPrice,'1.234567');
 await assert.rejects(setPlatformTokenPrice({...input,connector:s.connector,connectedAddress:issuer,issuerWalletAddress:issuer,currentTokenPrice:'1.2345678'}));
 assert.equal(s.writes.length,1);
});
test('changed quote blocks purchase before broadcast',async()=>{
 const s=setup();await assert.rejects(submitPlatformPurchase({...input,connector:s.connector,connectedAddress:investor,investorWalletAddress:investor,expectedPaymentAmountRaw:'1'}),{code:'PURCHASE_PRICE_CHANGED'});
 assert.equal(s.writes.length,0);
});
test('nonzero insufficient allowance resets before new selected-token approval',async()=>{
 const s=setup({allowance:5n});await approvePlatformPurchaseSpending({...input,connector:s.connector,connectedAddress:investor,investorWalletAddress:investor});
 assert.equal(s.writes.length,2);assert.deepEqual(s.writes[0].args,[controller,0n]);assert.equal(s.writes[1].address,pay);assert.equal(s.writes[1].args[1],(1n<<256n)-1n);
});
test('confirmation submits only chain/hash/token/action, never authoritative amounts or addresses',async()=>{
 const s=setup();await investmentApi.confirmObservedTransaction({chainId:11155111,txHash:hash,tokenUid:'asset-uid',expectedAction:'INVEST',paymentTokenAddress:pay,paymentAmountRaw:'999'});
 assert.deepEqual(s.posts[0].data,{chainId:11155111,txHash:hash,tokenUid:'asset-uid',expectedAction:'INVEST'});
});

test('changed redemption payout blocks issuer execution before broadcast',async()=>{
 const s=setup({account:issuer});
 await assert.rejects(submitPlatformRedemption({...input,connector:s.connector,connectedAddress:issuer,investorWalletAddress:investor,expectedPaymentAmountRaw:'1'}),{code:'REDEMPTION_PRICE_CHANGED'});
 assert.equal(s.writes.length,0);
});

test('price confirmation does not depend on the payment-token catalogue for modern controllers',async()=>{
 const s=setup({decimals:18,account:issuer});
 s.catalogue=[];
 const priceInput={...input,paymentTokenAddress:''};
 const result=await setPlatformTokenPrice({...priceInput,connector:s.connector,connectedAddress:issuer,issuerWalletAddress:issuer,currentTokenPrice:'1.5'});
 assert.equal(result.priceRaw,1500000n);
 assert.equal(result.currentTokenPrice,'1.5');
 assert.equal((await getPlatformTokenPrice(priceInput)).currentTokenPrice,'1.5');
 assert.equal(s.writes.length,1);
 assert.equal(s.writes[0].functionName,'setPrice');
});

test('legacy price confirmation recovers the controller payment token on-chain',async()=>{
 const s=setup({decimals:6,legacy:true,account:issuer});
 s.catalogue=[];
 const priceInput={...input,paymentTokenAddress:''};
 const result=await setPlatformTokenPrice({...priceInput,connector:s.connector,connectedAddress:issuer,issuerWalletAddress:issuer,currentTokenPrice:'2.25'});
 assert.equal(result.priceRaw,2250000n);
 assert.equal(result.paymentToken,pay);
 assert.equal((await getPlatformTokenPrice(priceInput)).currentTokenPrice,'2.25');
});
