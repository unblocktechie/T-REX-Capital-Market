import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePaymentTokenFields, normalizePaymentTokens, paymentContextOf } from '../src/config/payment-tokens.js';
import { parseExactUnits, calculatePaymentRaw } from '../src/utils/paymentAmounts.js';
const address='0x1111111111111111111111111111111111111111';
const controller='0x2222222222222222222222222222222222222222';
test('catalogue normalizes metadata and preserves inactive rows for explicit validation',()=>{
 const rows=normalizePaymentTokens({paymentTokens:[{contractAddress:address,platformControllerAddress:controller,symbol:'COIN',decimals:18,chainId:11155111,active:true,supportedActions:['PURCHASE','REDEMPTION']}]});
 assert.equal(rows[0].contractAddress,address); assert.equal(rows[0].controllerAddress,controller); assert.equal(rows[0].decimals,18);assert.equal(rows[0].active,true);
 assert.equal(normalizePaymentTokens([{contractAddress:address,symbol:'OFF',decimals:6,chainId:11155111,active:false}])[0].active,false);
});

test('catalogue normalizes payment-token image aliases for UI display',()=>{
 const rows=normalizePaymentTokens({paymentTokens:[{
  contractAddress:address,
  symbol:'USDG',
  decimals:6,
  chainId:11155111,
  active:true,
  paymentTokenImageUrl:'/api/v1/payment-tokens/usdg/image',
 }]});
 assert.equal(rows[0].symbol,'USDG');
 assert.equal(rows[0].imageUrl,'/api/v1/payment-tokens/usdg/image');
});

test('currency identity is taken from saved generic fields, never USDT aliases',()=>{
 assert.deepEqual(paymentContextOf({raw:{paymentTokenAddress:address,platformControllerAddress:controller,paymentTokenSymbol:'COIN'}}),{paymentTokenAddress:address,controllerAddress:controller,paymentTokenSymbol:'COIN'});
 assert.equal(paymentContextOf({usdtContractAddress:address}).paymentTokenAddress,'');
 assert.equal(paymentContextOf({metadata:{platformController:controller}}).controllerAddress,controller);
 assert.equal(paymentContextOf({paymentToken:{controllerAddress:controller}}).controllerAddress,controller);
 assert.deepEqual(
  paymentContextOf({information:{paymentTokenAddress:address,platformControllerAddress:controller,paymentTokenSymbol:'COIN'}}),
  {paymentTokenAddress:address,controllerAddress:controller,paymentTokenSymbol:'COIN'},
 );
 assert.deepEqual(
  paymentContextOf({asset:{paymentTokenAddress:address,platformControllerAddress:controller,paymentTokenSymbol:'COIN'}}),
  {paymentTokenAddress:address,controllerAddress:controller,paymentTokenSymbol:'COIN'},
 );
 assert.deepEqual(
  paymentContextOf({interest:{raw:{paymentTokenAddress:address,platformControllerAddress:controller,paymentTokenSymbol:'COIN'}}}),
  {paymentTokenAddress:address,controllerAddress:controller,paymentTokenSymbol:'COIN'},
 );
});
test('amount conversion rejects precision loss and quotes match both contract divisions',()=>{
 assert.throws(()=>parseExactUnits('1.0000001',6));
 assert.equal(parseExactUnits('1.000000',6),1000000n);
 assert.equal(calculatePaymentRaw(2500000000000000000n,12345678n,18,6,6),30864195n);
 assert.equal(calculatePaymentRaw(2500000000000000000n,12345678n,18,18,6),30864195000000000000n);
 assert.equal(calculatePaymentRaw(123456789000000000n,1000000n,18,18,6),123456000000000000n);
});

test('admin payment-token aliases follow canonical API name and symbol',()=>{
 const rows=normalizePaymentTokens({paymentTokens:[{
  paymentTokenUid:'70000000-0000-4000-8000-000000000001',
  paymentTokenCode:'SEPOLIA_USDT',
  paymentTokenName:'USD Coin',
  paymentTokenSymbol:'USDC',
  name:'Sepolia_USDT',
  symbol:'USDT',
  contractAddress:address,
  decimals:6,
  chainId:11155111,
  isActive:true,
 }]});
 assert.equal(rows[0].paymentTokenCode,'SEPOLIA_USDT');
 assert.equal(rows[0].name,'Sepolia_USDT');
 assert.equal(rows[0].paymentTokenName,'Sepolia_USDT');
 assert.equal(rows[0].symbol,'USDT');
 assert.equal(rows[0].paymentTokenSymbol,'USDT');
});


test('single payment-token detail response normalizes canonical fields for edit forms',()=>{
 const token=normalizePaymentTokenFields({
  paymentTokenUid:'70000000-0000-4000-8000-000000000001',
  paymentTokenCode:'SEPOLIA_USDT',
  paymentTokenName:'USD Coin',
  paymentTokenSymbol:'USDC',
  name:'Sepolia_USDT',
  symbol:'USDT',
 });
 assert.equal(token.paymentTokenName,'Sepolia_USDT');
 assert.equal(token.paymentTokenSymbol,'USDT');
 assert.equal(token.paymentTokenCode,'SEPOLIA_USDT');
});
