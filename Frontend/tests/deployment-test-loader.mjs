import './controller-test-loader.mjs';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { registerHooks } from 'node:module';
import { transformSync } from 'rolldown/experimental';

const src = new URL('../src/', import.meta.url).href;
const moduleUrl = (code) => 'data:text/javascript,' + encodeURIComponent(code);
const fixtures = {
  '@/store/auth.store': 'export const useAuthStore=select=>select({user:globalThis.__deploymentTest.user});',
  '@/store/tokenIssuance.store': 'export const useTokenIssuanceStore=select=>select(globalThis.__deploymentTest.store);',
  '@/store/ui.store': 'export const useUiStore=select=>select({walletRequiredChainId:null,setWalletRequiredChainId:()=>{}});',
  '@/hooks/useMyToken': 'export const myTokenQueryKey=key=>["tokens","me",key]; export const useMyToken=()=>globalThis.__deploymentTest.tokenRecord;',
  '@/hooks/useTokenIssuanceBootstrap': 'export const useTokenIssuanceBootstrap=()=>({isLoading:false});',
  '@/hooks/useOrganization': 'export const useOrganization=()=>({organization:globalThis.__deploymentTest.organization,isLoading:false});',
  '@/hooks/useWalletConnection': 'export const useWalletConnection=()=>globalThis.__deploymentTest.wallet;',
  '@/hooks/useDocumentTitle': 'export const useDocumentTitle=()=>{};',
  '@tanstack/react-query': 'export const useQueryClient=()=>({setQueryData:()=>{}});',
  'react-router-dom': 'export const useNavigate=()=>path=>globalThis.__deploymentTest.navigations.push(path); export const useLocation=()=>({pathname:globalThis.__deploymentTest.pathname}); export const Navigate=({to})=>{globalThis.__deploymentTest.redirect=to;return null;}; export const Outlet=()=>"recovery-outlet";',
  'sonner': 'export const toast={success:()=>{},error:()=>{}};',
  '@/components/ui/Button': 'export const Button=props=>{globalThis.__deploymentTest.buttons.push(props);return props.children;};',
  '@/components/token-issuance/DeploymentProgress': 'export const DeploymentProgress=()=>null;',
  '@/components/token-issuance/IssuancePrimitives': 'export const AddressDisplay=()=>null;export const InfoCallout=()=>null;',
  '@/components/loaders/DelayedTrexLoader': 'export const WorkspaceRouteLoader=()=>"loading";',
  '@/api/tokens': 'export const tokenApi={submit:async payload=>{globalThis.__deploymentTest.submissions.push(payload);return {ok:true,pending:false,data:{tokenUid:"token-1",status:"deployed"}};}};',
  '@/services/trexDeployment.service': 'export const recoverTrexDeploymentState=async()=>({tokenAddress:globalThis.__deploymentTest.asset,contracts:{token:globalThis.__deploymentTest.asset},paused:false}); export const readTrexTokenPaused=async()=>false; export const activateTrexTransfers=async()=>({alreadyActive:true}); export const deployTrexSuite=()=>{throw new Error("Must not redeploy an existing token");};',
};

registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(src) && fixtures[specifier]) {
      return { url: moduleUrl(fixtures[specifier]), shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(src) && url.endsWith('.jsx')) {
      const result = transformSync(url, readFileSync(new URL(url), 'utf8'), {
        jsx: { runtime: 'automatic' },
      });
      if (result.errors.length) throw new Error(JSON.stringify(result.errors));
      return { format: 'module', source: result.code, shortCircuit: true };
    }
    return next(url, context);
  },
});
