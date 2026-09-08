import { AlertTriangle, ArrowLeft, ExternalLink, RefreshCcw, ShieldCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { tokenApi } from '@/api/tokens';
import { DeploymentProgress } from '@/components/token-issuance/DeploymentProgress';
import { AddressDisplay, InfoCallout } from '@/components/token-issuance/IssuancePrimitives';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { getTokenDeploymentPayload } from '@/utils/tokenIssuance';
import { getWalletErrorMessage } from '@/utils/wallet';

const normalizeDeploymentResult = (response, fallbackNetwork) => ({
  tokenAddress: response?.tokenAddress || response?.contractAddress || response?.token?.address || '',
  tokenName: response?.tokenName || response?.token?.name || '',
  symbol: response?.symbol || response?.token?.symbol || '',
  network: response?.network || fallbackNetwork || '',
  identityRegistryAddress: response?.identityRegistryAddress || response?.identityRegistry?.address || '',
  identityRegistryStorageAddress: response?.identityRegistryStorageAddress || response?.identityRegistryStorage?.address || '',
  complianceAddress: response?.complianceAddress || response?.complianceContractAddress || response?.compliance?.address || '',
  transactionHash: response?.transactionHash || response?.txHash || '',
  deployedAt: response?.deployedAt || response?.createdAt || new Date().toISOString(),
  status: response?.status || 'confirmed',
  explorerUrl: response?.explorerUrl || '',
  raw: response,
});

const deploymentErrorMessage = (error) => {
  if (error?.response?.status === 404) {
    return 'The token deployment service is not available yet. Your draft is safe; connect the deployment backend before retrying.';
  }
  if (error?.response?.status === 400) {
    return 'The deployment configuration was rejected. Review the validation details and try again.';
  }
  if (error?.code === 'ECONNABORTED') {
    return 'Deployment confirmation timed out. Check the transaction status before retrying.';
  }
  const walletMessage = getWalletErrorMessage(error, '');
  if (/cancelled|rejected|denied/i.test(walletMessage)) return 'The wallet request was cancelled. No deployment was completed.';
  if (/insufficient|funds|gas/i.test(walletMessage)) return 'The connected wallet does not have enough native balance for deployment fees.';
  if (/network|chain/i.test(walletMessage)) return 'Please switch to the supported network and try again.';
  return 'Token deployment could not be completed. Your draft has been preserved.';
};

export default function DeploymentProcessingPage() {
  const navigate = useNavigate();
  const wallet = useWalletConnection();
  const tokenInformation = useTokenIssuanceStore((state) => state.tokenInformation);
  const supplyPricing = useTokenIssuanceStore((state) => state.supplyPricing);
  const identityClaims = useTokenIssuanceStore((state) => state.identityClaims);
  const compliance = useTokenIssuanceStore((state) => state.compliance);
  const agents = useTokenIssuanceStore((state) => state.agents);
  const deployment = useTokenIssuanceStore((state) => state.deployment);
  const setDeployment = useTokenIssuanceStore((state) => state.setDeployment);
  const startedRef = useRef(false);
  useDocumentTitle('Deploying Token');

  useEffect(() => {
    if (startedRef.current || deployment.status !== 'processing') return;
    startedRef.current = true;
    if (deployment.requestStartedAt) {
      setDeployment({
        status: 'error',
        canRetry: false,
        error: 'A deployment request may already be in progress. Check the transaction or backend deployment status before starting another request.',
      });
      return;
    }

    const deploy = async () => {
      let requestSent = false;
      try {
        if (!wallet.isConnected) throw new Error('Connect the authorized organization wallet before deployment.');
        if (!wallet.isCorrectNetwork) throw new Error('Please switch to the supported network.');
        setDeployment({ activeStage: 1, requestStartedAt: new Date().toISOString(), canRetry: false });
        const payload = getTokenDeploymentPayload(
          { tokenInformation, supplyPricing, identityClaims, compliance, agents },
          wallet.address,
        );
        setDeployment({ activeStage: 2 });
        requestSent = true;
        const response = await tokenApi.deploy(payload);
        const result = normalizeDeploymentResult(
          response,
          wallet.chain?.name || tokenInformation.network || wallet.requiredChain?.name,
        );
        if (result.transactionHash) setDeployment({ transactionHash: result.transactionHash, activeStage: 7 });
        if (!result.tokenAddress || !result.transactionHash) {
          throw new Error('Deployment response did not include a confirmed token address and transaction hash.');
        }
        setDeployment({
          status: 'success',
          activeStage: 7,
          transactionHash: result.transactionHash,
          result: {
            ...result,
            tokenName: result.tokenName || tokenInformation.name,
            symbol: result.symbol || tokenInformation.symbol,
          },
          error: '',
          requestStartedAt: null,
          canRetry: false,
        });
        navigate(ROUTES.tokenSuccess(result.tokenAddress), { replace: true });
      } catch (error) {
        console.error('Token deployment failed', error);
        const transactionHash = error?.response?.data?.transactionHash || error?.response?.data?.txHash || '';
        const safeResponseFailure = [400, 404].includes(error?.response?.status);
        const canRetry = !transactionHash && (!requestSent || safeResponseFailure);
        setDeployment({
          status: 'error',
          error: deploymentErrorMessage(error),
          canRetry,
          requestStartedAt: canRetry ? null : new Date().toISOString(),
          ...(transactionHash ? { transactionHash } : {}),
        });
      }
    };

    deploy();
  }, [agents, compliance, deployment.status, identityClaims, navigate, setDeployment, supplyPricing, tokenInformation, wallet.address, wallet.chain?.name, wallet.isConnected, wallet.isCorrectNetwork, wallet.requiredChain?.name]);

  const retry = () => {
    startedRef.current = false;
    if (!deployment.canRetry || deployment.transactionHash) return;
    setDeployment({
      status: 'processing',
      activeStage: 0,
      error: '',
      requestStartedAt: null,
      canRetry: false,
    });
  };

  return (
    <div className="deployment-page">
      <section className="deployment-card">
        <div className="deployment-card__hero">
          <span className={deployment.status === 'error' ? 'deployment-loader deployment-loader--error' : 'deployment-loader'}>
            {deployment.status === 'error' ? <AlertTriangle size={28} /> : <ShieldCheck size={28} />}
          </span>
          <span className="eyebrow">Secure contract deployment</span>
          <h1>{deployment.status === 'error' ? 'Deployment needs attention' : 'Deploying your token'}</h1>
          <p>{deployment.status === 'error' ? 'No duplicate deployment has been started. Review the message below before retrying.' : 'Keep this page open while the backend and blockchain confirm each stage.'}</p>
        </div>

        <DeploymentProgress activeStage={deployment.activeStage} status={deployment.status} />

        {deployment.transactionHash ? <AddressDisplay label="Transaction hash" address={deployment.transactionHash} explorerUrl={deployment.result?.explorerUrl} /> : null}
        {deployment.error ? <InfoCallout title="Deployment not completed" tone="warning" icon={AlertTriangle}>{deployment.error}</InfoCallout> : null}

        <div className="deployment-card__actions">
          {deployment.status === 'error' ? (
            <>
              <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(ROUTES.tokenIssuanceStep('review'))}>Return to review</Button>
              {deployment.canRetry && !deployment.transactionHash ? (
                <Button icon={RefreshCcw} onClick={retry}>Retry safely</Button>
              ) : null}
            </>
          ) : (
            <span><ExternalLink size={16} /> Wallet and backend confirmations may open outside this page.</span>
          )}
        </div>
      </section>
    </div>
  );
}
