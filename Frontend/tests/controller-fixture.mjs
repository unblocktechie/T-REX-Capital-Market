import { encodeFunctionData } from 'viem';
import { calculatePaymentRaw } from '../src/utils/paymentAmounts.js';
export const asset='0x1111111111111111111111111111111111111111';
export const pay='0x2222222222222222222222222222222222222222';
export const controller='0x3333333333333333333333333333333333333333';
export const issuer='0x4444444444444444444444444444444444444444';
export const investor='0x5555555555555555555555555555555555555555';
export const hash='0x'+'ab'.repeat(32);
export const input={chainId:11155111,tokenAddress:asset,paymentTokenAddress:pay,controllerAddress:controller,tokenAmount:'2.5'};
export function setup({decimals=6,legacy=false,allowance=(1n<<256n)-1n,account=investor}={}){
 const state={decimals,legacy,allowance,price:12345678n,writes:[],reads:[],posts:[],catalogue:[{contractAddress:pay,chainId:11155111,decimals,symbol:'PAY',active:true,supportedActions:['PURCHASE','REDEMPTION']}]};
 state.publicClient={
  async readContract(request){
   state.reads.push(request);
   const {functionName,args=[]}=request;
   switch(functionName){
    case 'PRICE_DECIMALS': if(legacy)throw Object.assign(new Error('Old interface'),{name:'ContractFunctionZeroDataError'});return 6;
    case 'paymentToken':return pay;
    case 'isPaymentToken':return true;
    case 'decimals':return decimals;
    case 'symbol':return 'PAY';
    case 'paused':return false;
    case 'getTokenInfo':return [issuer,18,state.price,true];
    case 'quoteBuy':case 'quoteRedeem':{
     const amount=args.at(-1);return [calculatePaymentRaw(amount,state.price,18,decimals,legacy?decimals:6),state.price,18,issuer];}
    case 'allowance':return state.allowance;
    case 'balanceOf':return 10n**30n;
    case 'tokenPrice':return state.price;
    default:throw new Error('Unexpected read '+functionName);
   }
  },
  async getBalance(){return 10n**18n;},
  async simulateContract(request){encodeFunctionData(request);return {request};},
  async waitForTransactionReceipt(){return {status:'success',transactionHash:hash};},
 };
 state.walletClient={async writeContract(request){state.writes.push(request);if(request.functionName==='setPrice')state.price=request.args[1];if(request.functionName==='approve')state.allowance=request.args[1];return hash;}};
 state.connector={async getProvider(){return {request:async({method})=>method==='eth_accounts'?[account]:'0xaa36a7'};}};
 globalThis.__paymentTest=state;return state;
}
