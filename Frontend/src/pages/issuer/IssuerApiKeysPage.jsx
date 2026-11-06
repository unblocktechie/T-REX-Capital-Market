import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CalendarClock, CheckCircle2, Info, KeyRound, RefreshCcw, Shield, SlidersHorizontal } from 'lucide-react';
import { organizationApi } from '@/api/organization';
import { ROUTES } from '@/config/routes';
import { web3Config } from '@/config/web3';
import { useChainConfig } from '@/hooks/useChains';
import { useOrganization } from '@/hooks/useOrganization';
import { useMyToken, getTokenRecordChainId, getTokenRecordChainUid } from '@/hooks/useMyToken';
import { tokenServiceWalletAddress } from '@/services/issuer/tokenServiceWallet.utils';
import { resolveTokenServiceWalletController } from '@/services/issuer/tokenServiceWalletController.utils';
import { readTokenServiceWallet } from '@/services/issuer/issuerServiceWallet.service';
import { deployedTokenAddress, getBotWalletReadiness } from '@/utils/botServiceWalletReadiness';
import { IssuerApiKeysCard } from '@/components/issuer/IssuerApiKeysCard';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { BotPolicyEditor } from '@/components/issuer/BotPolicyEditor';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { hasConfiguredAllowlist, isKeyActive, normalizePolicyOptions } from '@/utils/botPolicy';
import { shouldConfirmBotTabSwitch } from '@/utils/botTabNavigation';

const TABS = [
  { id: 'api-keys', title: 'API Key Management', icon: KeyRound, required: true },
  { id: 'network', title: 'Network Security', icon: Shield, required: true },
  { id: 'protection', title: 'Price Protection', icon: SlidersHorizontal, required: false },
  { id: 'schedule', title: 'Update Schedule', icon: CalendarClock, required: false },
];
const rowsOf = (payload) => {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.apiKeys)) return payload.apiKeys;
  if (Array.isArray(payload?.keys)) return payload.keys;
  return Array.isArray(payload) ? payload : [];
};
const uidOf = (row) => String(row?.issuerApiKeyUid || row?.apiKeyUid || row?.uid || row?.id || '');
const optionalConfigured = (policy, fields) => Boolean(policy && fields.some((field) => Array.isArray(policy[field]) ? policy[field].length : policy[field] !== null && policy[field] !== undefined && policy[field] !== ''));

export default function IssuerApiKeysPage() {
  useDocumentTitle('Bot Configuration');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { organization, isLoading: organizationLoading, error: organizationError } = useOrganization();
  const tokenQuery = useMyToken();
  const tokenRecord = tokenQuery.token;
  const tokenUid = tokenQuery.tokenUid;
  const tokenChainUid = getTokenRecordChainUid(tokenRecord) || tokenQuery.selectedChainUid;
  const tokenChainId = getTokenRecordChainId(tokenRecord) || web3Config.getChainRecordByUid(tokenChainUid)?.chainId;
  const requestedTokenUid = searchParams.get('tokenUid') || '';
  const requestedChainUid = searchParams.get('chainUid') || '';
  // Never report some OTHER asset's Service Wallet as ready when a specific
  // token's Configure Bot link brought the issuer to this page.
  const contextMatches = (!requestedTokenUid || requestedTokenUid.toLowerCase() === tokenUid.toLowerCase())
    && (!requestedChainUid || requestedChainUid.toLowerCase() === tokenChainUid.toLowerCase());
  const chainConfig = useChainConfig(tokenChainUid, { enabled: Boolean(tokenUid && tokenChainUid && contextMatches) });
  const tokenContract = deployedTokenAddress(tokenRecord);
  const chainRecord = web3Config.getChainRecordByUid(tokenChainUid) || web3Config.getChainRecordById(tokenChainId);
  const controllerAddress = resolveTokenServiceWalletController({
    chainConfig: chainConfig.data, chainRecord, tokenChainUid, tokenChainId,
  });
  const registeredAddress = contextMatches
    ? tokenServiceWalletAddress(organization?.tokenServiceWallets, tokenUid, tokenChainUid) : '';
  const canVerifyWallet = Boolean(contextMatches && tokenContract && controllerAddress && tokenChainId);
  const walletChainQuery = useQuery({
    queryKey: ['bot-config', 'service-wallet', tokenUid, tokenChainUid, tokenContract, controllerAddress, registeredAddress],
    queryFn: () => readTokenServiceWallet({ tokenAddress: tokenContract, chainId: tokenChainId, platformControllerAddress: controllerAddress }),
    enabled: Boolean(canVerifyWallet && registeredAddress && !organizationLoading),
    staleTime: 15_000,
    retry: false,
  });
  const walletStatus = getBotWalletReadiness({
    tokenUid, chainUid: tokenChainUid, contextMatches,
    tokenLoading: tokenQuery.isPending && tokenQuery.fetchStatus !== 'idle',
    organizationLoading, organizationError: Boolean(organizationError || tokenQuery.isError),
    registeredAddress, canVerify: canVerifyWallet,
    onchainAddress: walletChainQuery.data ?? null,
    verificationPending: walletChainQuery.isPending,
    verificationFailed: walletChainQuery.isError,
  });
  const setupTarget = contextMatches && tokenUid
    ? `${ROUTES.tokenDetails(tokenUid)}?setup=service-wallet` : ROUTES.projects;
  const [pendingWalletTarget, setPendingWalletTarget] = useState('');
  const requestedTab = searchParams.get('tab');
  const tab = TABS.some((item) => item.id === requestedTab) ? requestedTab : 'api-keys';
  const [selectedUid, setSelectedUid] = useState('');
  const [policyDirty, setPolicyDirty] = useState(false);
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [unsavedPolicySections, setUnsavedPolicySections] = useState({ network: false, protection: false, schedule: false });
  const reportUnsavedSections = useCallback((next) => {
    setUnsavedPolicySections((current) => Object.keys(current).every((section) => current[section] === Boolean(next[section]))
      ? current : { network: Boolean(next.network), protection: Boolean(next.protection), schedule: Boolean(next.schedule) });
  }, []);
  const [pendingTab, setPendingTab] = useState('');
  const [showBotHelp, setShowBotHelp] = useState(false);
  const keysQuery = useQuery({ queryKey: ['organization', 'api-keys'], queryFn: organizationApi.listApiKeys, staleTime: 15_000 });
  const policyOptionsQuery = useQuery({ queryKey: ['organization', 'api-key-policy-options'], queryFn: organizationApi.getApiKeyPolicyOptions, staleTime: 60_000, retry: 1 });
  const bounds = useMemo(() => normalizePolicyOptions(policyOptionsQuery.data), [policyOptionsQuery.data]);
  const activeKeys = useMemo(() => rowsOf(keysQuery.data).filter(isKeyActive).map((key) => ({ ...key, uid: uidOf(key), name: key.name || 'Issuer API key', isActive: true })).filter((key) => key.uid), [keysQuery.data]);
  const savedEligibleKeys = activeKeys.filter((key) => hasConfiguredAllowlist(key, bounds));
  const loaded = keysQuery.isSuccess && policyOptionsQuery.isSuccess && bounds.valid;
  const apiReady = loaded && savedEligibleKeys.length > 0;
  const ready = apiReady && walletStatus.ready;
  const keyReady = keysQuery.isSuccess && activeKeys.length > 0;
  const ipReady = loaded && savedEligibleKeys.length > 0;
  const attention = keysQuery.isError || policyOptionsQuery.isError || (policyOptionsQuery.isSuccess && !bounds.valid);
  const networkChecking = keysQuery.isPending || policyOptionsQuery.isPending;
  const checking = networkChecking || walletStatus.code === 'checking';
  const selected = activeKeys.find((key) => key.uid === selectedUid) || savedEligibleKeys[0] || activeKeys[0];
  const optionalPolicy = selected?.policy;
  const statuses = {
    'api-keys': keysQuery.isPending ? 'Checking' : keysQuery.isError ? 'Needs attention' : keyReady ? 'Complete' : 'Required',
    network: networkChecking ? 'Checking' : attention ? 'Needs attention' : ipReady ? 'Complete' : 'Required',
    protection: optionalConfigured(optionalPolicy, ['threshold', 'maxCumulative24hPercent']) ? 'Configured' : 'Optional',
    schedule: optionalConfigured(optionalPolicy, ['cooldownSeconds', 'frequency', 'allowedDays', 'startTime', 'endTime']) ? 'Configured' : 'Optional',
  };

  useEffect(() => {
    if (selectedUid && activeKeys.some((key) => key.uid === selectedUid)) return;
    const uid = savedEligibleKeys[0]?.uid || activeKeys[0]?.uid || '';
    if (uid !== selectedUid) setSelectedUid(uid);
  }, [selectedUid, activeKeys, savedEligibleKeys]);

  const commitTab = (next) => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('tab', next);
      return params;
    }, { replace: true });
  };
  const changeTab = (next) => {
    if (next === tab || pendingTab) return;
    // Guard every destination, including switches between the three policy tabs.
    // Edits in the API-key creation form are covered by the same guard.
    if (shouldConfirmBotTabSwitch(tab, next, { apiKeyDirty, policyDirty, unsavedPolicySections })) {
      setPendingTab(next);
      return;
    }
    commitTab(next);
  };
  const openWalletSetup = () => {
    if (apiKeyDirty || policyDirty || Object.values(unsavedPolicySections).some(Boolean)) {
      setPendingWalletTarget(setupTarget);
    } else {
      navigate(setupTarget);
    }
  };
  const discardAndOpenWallet = () => {
    if (!pendingWalletTarget) return;
    setPolicyDirty(false);
    setApiKeyDirty(false);
    reportUnsavedSections({ network: false, protection: false, schedule: false });
    navigate(pendingWalletTarget);
    setPendingWalletTarget('');
  };
  const discardAndChangeTab = () => {
    if (!pendingTab) return;
    // Discard in-memory drafts as well as the badges. The policy editor is keyed
    // by tab, so it remounts from the saved backend policy on the destination.
    setPolicyDirty(false);
    setApiKeyDirty(false);
    reportUnsavedSections({ network: false, protection: false, schedule: false });
    commitTab(pendingTab);
    setPendingTab('');
  };

  return (
    <main className="bot-config issuer-api-keys-page" aria-labelledby="bot-config-title">
      <header className="bot-config__header">
        <div>
          <span className="eyebrow">Automatic price updates</span>
          <h1 id="bot-config-title">Bot Configuration</h1>
          <p>Manage API keys, approved IPs, and optional price safeguards.</p>
        </div>
        <span className={`bot-config__readiness ${ready ? 'is-ready' : attention || walletStatus.code === 'mismatch' ? 'is-attention' : ''}`} role="status">
          {ready ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {ready ? 'Bot setup complete' : checking ? 'Checking setup' : 'Bot setup needed'}
        </span>
      </header>

      <section className="bot-config__overview" aria-label="Bot setup progress">
        <div className="bot-config__overview-main">
          <div className="bot-config__overview-heading">
            <strong className="bot-config__overview-title">
              {ready ? <CheckCircle2 size={20} aria-hidden="true" /> : <AlertCircle size={20} aria-hidden="true" />}
              {ready ? 'Setup complete for this token' : walletStatus.code === 'missing' && apiReady
                ? 'One more step: Service Wallet' : 'Complete the required bot setup'}
            </strong>
            <button type="button" className="bot-config__learn-more" onClick={() => setShowBotHelp(true)} aria-haspopup="dialog">
              <Info size={15} aria-hidden="true" /> Learn more
            </button>
          </div>
          <div className="bot-config__overview-details">
            <p>{ready
              ? 'A Service Wallet is verified on-chain for your asset, and an active API key has approved IPs.'
              : walletStatus.code === 'missing'
                ? 'Your API key and approved IPs are separate from the Service Wallet. Register a Service Wallet for this token to authorize automated price updates.'
                : walletStatus.code === 'wrong-network'
                  ? 'The selected token belongs to another network. Open that token on its network before checking wallet readiness.'
                  : walletStatus.code === 'no-token'
                    ? 'A deployed token and its Service Wallet are required before a bot can update that token’s price.'
                    : walletStatus.code === 'unknown' || walletStatus.code === 'mismatch'
                      ? 'Service Wallet authorization could not be confirmed on-chain. Review the token’s wallet setup before running the bot.'
                      : walletStatus.code === 'checking'
                        ? 'Checking this token’s Service Wallet authorization. API keys alone do not mean the bot is ready.'
                        : 'A Service Wallet, an active API key, and approved IP addresses are required to run your bot.'}</p>
            <div className="bot-config__requirements" role="list" aria-label="Required bot setup steps">
              {TABS.filter((item) => item.required).map((item) => (
                <span role="listitem" key={item.id} className={`bot-config__requirement ${statuses[item.id] === 'Complete' ? 'is-complete' : ''}`}>
                  {statuses[item.id] === 'Complete' ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertCircle size={14} aria-hidden="true" />}
                  <span>{item.id === 'api-keys' ? 'API Keys' : 'Network Security'}</span>
                </span>
              ))}
              <span role="listitem" className={`bot-config__requirement ${walletStatus.ready ? 'is-complete' : ''}`}>
                {walletStatus.ready ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertCircle size={14} aria-hidden="true" />}
                <span>Service Wallet · {walletStatus.label}</span>
              </span>
            </div>
          </div>
        </div>
        <div className="bot-config__overview-actions">
          <span className="bot-config__progress-count" aria-label={`${Number(keyReady) + Number(ipReady) + Number(walletStatus.ready)} of 3 required steps complete`}>
            {Number(keyReady) + Number(ipReady) + Number(walletStatus.ready)} of 3 required
          </span>
          {!ready && walletStatus.code !== 'checking' && (
            <button type="button" className="bot-config__wallet-action" onClick={openWalletSetup}>
              {walletStatus.code === 'no-token' || walletStatus.code === 'wrong-network'
                ? 'View tokens' : walletStatus.code === 'missing' ? 'Set up Service Wallet' : 'Review Service Wallet'}
            </button>
          )}
        </div>
      </section>

      {(policyOptionsQuery.isError || (policyOptionsQuery.isSuccess && !bounds.valid)) ? (
        <div className="bot-config__notice bot-config__notice--warning" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{policyOptionsQuery.isError ? 'Bot policy settings could not be loaded. Creating new keys and editing policies are temporarily unavailable.' : 'Policy minimum and maximum limits are inconsistent. Ask an administrator to correct the issuer API-key settings.'} Your existing keys remain unchanged.</span>
          {policyOptionsQuery.isError && <button type="button" className="bot-config__retry" onClick={() => policyOptionsQuery.refetch()}><RefreshCcw size={15} /> Retry</button>}
        </div>
      ) : null}
      <nav className="bot-config__tabs" aria-label="Bot configuration settings">
        {TABS.map(({ id, title, icon: Icon, required }, index) => {
          const hasUnsavedChanges = id === 'api-keys' ? apiKeyDirty : unsavedPolicySections[id];
          return <button type="button" key={id} className={`bot-config__tab ${tab === id ? 'is-active' : ''} ${hasUnsavedChanges ? 'has-unsaved' : ''}`}
            onClick={() => changeTab(id)} aria-current={tab === id ? 'page' : undefined}
            aria-label={hasUnsavedChanges ? `${title}: Unsaved changes` : undefined}>
            <span className="bot-config__tab-symbol"><Icon size={19} aria-hidden="true" /></span>
            <span className="bot-config__tab-body"><strong>{title}</strong>
              <small>{required ? `Step ${index + 1} · Required` : 'Optional safeguard'}</small>
            </span>
            <span className={`bot-config__tab-state ${hasUnsavedChanges ? 'has-unsaved' : statuses[id] === 'Complete' || statuses[id] === 'Configured' ? 'is-complete' : ''}`}>
              {hasUnsavedChanges ? <AlertCircle size={14} aria-hidden="true" /> : statuses[id] === 'Complete' || statuses[id] === 'Configured' ? <CheckCircle2 size={14} /> : null}
              {hasUnsavedChanges ? 'Unsaved changes' : statuses[id]}
            </span>
          </button>;
        })}
      </nav>

      <p className="bot-config__tabs-mobile-help">Swipe sideways to see all four settings sections.</p>
      <div className="bot-config__content">
        {tab === 'api-keys' ? (
          <IssuerApiKeysCard policyOptionsQuery={policyOptionsQuery} onUnsavedChange={setApiKeyDirty} />
        ) : (
          <BotPolicyEditor key={tab} section={tab} keys={activeKeys} selectedUid={selected?.uid || ''}
            onSelectedUidChange={setSelectedUid} onNavigateNetwork={() => changeTab('network')} optionsQuery={policyOptionsQuery} onDirtyChange={setPolicyDirty} onSectionDirtyChange={reportUnsavedSections} />
        )}
      </div>
      <Modal open={showBotHelp} onClose={() => setShowBotHelp(false)} title="Set Up Your Price Update Bot" trapFocus
        footer={<Button onClick={() => setShowBotHelp(false)}>Got it</Button>}>
        <div className="bot-config__help-content">
          <p>To run your bot, you need a registered <strong>Service Wallet</strong>, an <strong>API key</strong>, and an <strong>approved IP address</strong>.</p>
          <p>Each API key can have its own list of allowed IP addresses, so you can run different bots for different purposes.</p>
          <p>You can also customize how each bot works using these optional settings:</p>
          <ul>
            <li><strong>Price Protection:</strong> Set limits on how much the token price can increase or decrease.</li>
            <li><strong>Update Schedule:</strong> Choose which days and times your bot can update prices, and how long it must wait between updates.</li>
          </ul>
          <p>These settings are optional and give you more control over your bots.</p>
        </div>
      </Modal>
      <Modal open={Boolean(pendingWalletTarget)} title="Discard unsaved changes?" trapFocus onClose={() => setPendingWalletTarget('')}
        footer={<><Button variant="secondary" onClick={() => setPendingWalletTarget('')}>Keep editing</Button>
          <Button variant="danger" onClick={discardAndOpenWallet}>Discard changes</Button></>}>
        <p>Your bot settings have unsaved changes. Opening the Service Wallet setup will discard them.</p>
      </Modal>
      <Modal open={Boolean(pendingTab)} title="Discard unsaved changes?" trapFocus onClose={() => setPendingTab('')}
        footer={<><Button variant="secondary" onClick={() => setPendingTab('')}>Keep editing</Button>
          <Button variant="danger" onClick={discardAndChangeTab}>Discard changes</Button></>}>
        <p>You have changes that have not been saved. Switching to another tab will discard these edits.</p>
      </Modal>
      <p className="bot-config__disclaimer">Manual price changes retain their existing workflow. Rules apply only to issuer API-key requests; smart-contract permissions and Service Wallet access are managed separately.</p>
    </main>
  );
}
