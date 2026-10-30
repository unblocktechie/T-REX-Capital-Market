import './register-aliases.mjs';
import {readFileSync} from 'node:fs';
import { registerHooks } from 'node:module';
const src = new URL('../src/', import.meta.url);
const viem = new URL('../node_modules/viem/_esm/index.js', import.meta.url).href;
const chains = new URL('../node_modules/viem/_esm/chains/index.js', import.meta.url).href;
const moduleUrl = (code) => 'data:text/javascript,' + encodeURIComponent(code);
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(src.href)) {
      if(specifier==='@/abi/TREXPlatformController.json')return {url:moduleUrl('export default '+readFileSync(new URL('abi/TREXPlatformController.json',src),'utf8')),shortCircuit:true};
      if (specifier === '@/config/env') return {url:moduleUrl("export const env={apiBaseUrl:'http://fixture.invalid/api',apiVersion:'v1',requestTimeout:1000,features:{mockApi:false},web3:{rpcUrl:'http://fixture.invalid'},trex:{}}; export const DEFAULT_TREX_PLATFORM_CONTROLLER_ADDRESS='';"),shortCircuit:true};
      if (specifier === '@/config/web3') return {url:moduleUrl(`import {sepolia} from '${chains}'; const record={chainId:sepolia.id,chainUid:'sepolia',chainName:sepolia.name,identityFactoryAddress:'0x0000000000000000000000000000000000000011',platformControllerAddress:globalThis.__deploymentTest?.tokenRecord?.token?.controllerAddress||'',trexFactoryAddress:'0x0000000000000000000000000000000000000012'}; export const web3Config={requiredChain:sepolia,supportedChains:[sepolia],getChainRecordById:id=>Number(id)===sepolia.id?record:null,getChainRecordByUid:uid=>String(uid||'')==='sepolia'?record:null};`),shortCircuit:true};
      if (specifier === '@/api/axios/axios.instance' || (specifier === './axios.instance' && context.parentURL.includes('/api/axios/'))) return {url:moduleUrl('export const apiClient={get:async()=>({data:{data:globalThis.__paymentTest.catalogue}}),post:async(url,data)=>{globalThis.__paymentTest.posts.push({url,data});return {data:{data:{status:"SUBMITTED"}}}}};'),shortCircuit:true};
      if (specifier === 'viem' && context.parentURL.endsWith('/trexPlatformController.service.js')) return {url:moduleUrl(`export * from '${viem}'; export const createPublicClient=()=>globalThis.__paymentTest.publicClient; export const createWalletClient=()=>globalThis.__paymentTest.walletClient;`),shortCircuit:true};
    }
    return next(specifier,context);
  },
});
