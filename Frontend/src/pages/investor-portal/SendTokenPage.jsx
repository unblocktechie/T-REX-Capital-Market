import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Info,
  Scale,
  Send,
  ShieldCheck,
  UserRoundCheck,
  WalletCards,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  InvestorTokenActionHeader,
  InvestorTokenIdentityCard,
  LockedAddressField,
  RegisteredInvestorWalletGate,
  TokenActionCheck,
  TokenActionUnavailable,
} from '@/components/investor-marketplace/InvestorTokenActionPrimitives';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useRegisteredInvestmentAction } from '@/hooks/useRegisteredInvestmentAction';
import { useRegisteredInvestorWalletGuard } from '@/hooks/useRegisteredInvestorWalletGuard';
import { getInvestmentActionContext } from '@/utils/investmentPurchase';

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
const isWalletAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
const sameAddress = (left, right) => String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
const decimalPlaces = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized.includes('e')) return 0;
  return normalized.includes('.') ? normalized.split('.')[1].length : 0;
};

export default function SendTokenPage() {
  const { interestUid } = useParams();
  const navigate = useNavigate();
  const { application, token, loading, error, ready } = useRegisteredInvestmentAction(interestUid);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [addressChecked, setAddressChecked] = useState(false);

  useDocumentTitle(token ? `${token.name} · Send Tokens` : 'Send Tokens');

  const applicationRoute = ROUTES.applicationDetail(interestUid);
  const context = useMemo(() => getInvestmentActionContext(token || application), [application, token]);
  const walletGuard = useRegisteredInvestorWalletGuard(context.investorWalletAddress, context.chainId);
  const sendAmount = Number(amount) > 0 ? Number(amount) : 0;
  const maxTokenBalance = Number(token?.maxBalancePerInvestor ?? token?.maxBalance ?? 0);
  const tokenDecimals = Number.isInteger(Number(token?.decimals)) ? Number(token.decimals) : null;

  const recipientError = useMemo(() => {
    if (!recipient.trim()) return '';
    if (!isWalletAddress(recipient)) return 'Enter a valid recipient wallet address.';
    if (sameAddress(recipient, context.investorWalletAddress)) return 'Choose a recipient wallet different from your registered investment wallet.';
    return '';
  }, [context.investorWalletAddress, recipient]);

  const amountError = useMemo(() => {
    if (!String(amount).trim()) return '';
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return 'Enter a token amount greater than zero.';
    if (tokenDecimals !== null && decimalPlaces(amount) > tokenDecimals) {
      return `Enter no more than ${tokenDecimals} decimal place${tokenDecimals === 1 ? '' : 's'} for ${token?.symbol || 'this token'}.`;
    }
    if (Number.isFinite(maxTokenBalance) && maxTokenBalance > 0 && parsed > maxTokenBalance) {
      return `The transfer amount cannot exceed the configured holder limit of ${number.format(maxTokenBalance)} ${token?.symbol || 'tokens'}.`;
    }
    return '';
  }, [amount, maxTokenBalance, token?.symbol, tokenDecimals]);

  const checkRecipient = () => {
    if (!recipient.trim() || recipientError) {
      setAddressChecked(false);
      toast.error(recipientError || 'Enter a recipient wallet address to continue.');
      return;
    }
    setAddressChecked(true);
    toast.success('Recipient address is ready for the next compliance check.');
  };

  const canSend = Boolean(
    walletGuard.ready
      && addressChecked
      && isWalletAddress(recipient)
      && !recipientError
      && sendAmount
      && !amountError,
  );

  const handleSend = () => {
    if (!walletGuard.ready) {
      toast.error('Connect the registered investor wallet on the required network to continue.');
      return;
    }
    if (!addressChecked || recipientError || !isWalletAddress(recipient)) {
      toast.error(recipientError || 'Enter and check a valid recipient wallet address.');
      return;
    }
    if (!sendAmount || amountError) {
      toast.error(amountError || 'Enter a token amount greater than zero.');
      return;
    }
    toast.info('Token transfer execution is coming soon. No transaction has been sent.');
  };

  if (loading) {
    return <div className="page-stack investor-token-action-page"><div className="investor-token-action-loading" /><div className="investor-token-action-loading investor-token-action-loading--tall" /></div>;
  }

  if (error || !application || !token) {
    return <TokenActionUnavailable title="Send Tokens" description="This investment could not be loaded right now." onBack={() => navigate(ROUTES.applications)} />;
  }

  if (!ready) {
    return <TokenActionUnavailable title="Send Tokens" description="Token transfers are not available for this application yet." onBack={() => navigate(applicationRoute)} backLabel="Back to Application" />;
  }

  return (
    <div className="page-stack investor-token-action-page">
      <InvestorTokenActionHeader
        eyebrow="Token action"
        title="Send Tokens"
        description="Prepare a compliant token transfer to another wallet."
        onBack={() => navigate(applicationRoute)}
      />

      <div className="investor-token-action-layout">
        <main className="investor-token-action-main">
          <InvestorTokenIdentityCard token={token} readyLabel="Registered investor" />

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading">
              <div><span>Selected token</span><h2>Transfer from your registered wallet</h2></div>
              <WalletCards size={19} />
            </div>
            <LockedAddressField label="Primary Investment Wallet" value={context.investorWalletAddress} />
          </Card>

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading">
              <div><span>Recipient</span><h2>Where are you sending tokens?</h2></div>
              <Send size={19} />
            </div>
            <div className="investor-token-action-recipient-row">
              <label className={`investor-token-action-text-field ${addressChecked && !recipientError ? 'is-checked' : ''} ${recipientError ? 'is-invalid' : ''}`}>
                <span className="sr-only">Recipient wallet address</span>
                <input
                  value={recipient}
                  onChange={(event) => { setRecipient(event.target.value); setAddressChecked(false); }}
                  placeholder="0x… recipient wallet address"
                  spellCheck="false"
                  autoComplete="off"
                  aria-invalid={Boolean(recipientError)}
                />
                {addressChecked && !recipientError ? <CheckCircle2 size={17} /> : null}
              </label>
              <Button variant="secondary" onClick={checkRecipient} disabled={!recipient.trim() || Boolean(recipientError)}>Check Eligibility</Button>
            </div>
            {recipientError ? <p className="investor-token-action-field-error">{recipientError}</p> : null}
            <p className="investor-token-action-helper">Only eligible recipient identities can receive permissioned tokens. The full eligibility check will run before a real transfer is submitted.</p>
          </Card>

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading investor-token-action-card__heading--with-meta">
              <div><span>Amount to transfer</span><h2>Enter the token amount</h2></div>
              {Number.isFinite(maxTokenBalance) && maxTokenBalance > 0 ? <small>Per-holder limit: {number.format(maxTokenBalance)} {token.symbol}</small> : null}
            </div>
            <label className={`investor-token-action-amount-field ${amountError ? 'is-invalid' : ''}`}>
              <span className="sr-only">Token amount to transfer</span>
              <input
                type="number"
                min="0"
                max={Number.isFinite(maxTokenBalance) && maxTokenBalance > 0 ? maxTokenBalance : undefined}
                step="any"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                aria-invalid={Boolean(amountError)}
              />
              <strong>{token.symbol}</strong>
            </label>
            {amountError ? <p className="investor-token-action-field-error">{amountError}</p> : null}
            <p className="investor-token-action-field-hint">Your actual token balance and the recipient&apos;s final holder balance will be verified before execution.</p>
          </Card>

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading"><div><span>Compliance validation</span><h2>Checks before transfer</h2></div><ShieldCheck size={19} /></div>
            <div className="investor-token-action-checks">
              <TokenActionCheck icon={UserRoundCheck} label="Recipient identity" detail="The recipient address must pass token eligibility checks before execution." status={addressChecked && !recipientError ? 'Address ready' : 'Check required'} tone={addressChecked && !recipientError ? 'success' : 'neutral'} />
              <TokenActionCheck icon={ShieldCheck} label="Country restriction" detail="Token country rules will be evaluated before the transaction." status="Checked at transfer" tone="neutral" />
              <TokenActionCheck icon={Scale} label="Max balance rule" detail="The recipient holder limit will be enforced before execution." status="Enforced" />
            </div>
          </Card>
        </main>

        <aside className="investor-token-action-aside">
          <Card className="investor-token-order-card">
            <div className="investor-token-order-card__title"><span>Transfer summary</span><Send size={18} /></div>
            <div className="investor-token-order-row"><span>Send Amount</span><strong>{sendAmount ? `${number.format(sendAmount)} ${token.symbol}` : '—'}</strong></div>
            <div className="investor-token-order-row"><span>Recipient</span><strong className="investor-token-order-address">{recipient || 'Not entered'}</strong></div>
            <div className="investor-token-order-row"><span>Network</span><strong>{walletGuard.targetNetworkLabel}</strong></div>
            <div className="investor-token-order-row"><span>Estimated Gas</span><strong>Calculated at confirmation</strong></div>
            <div className="investor-token-action-note"><Info size={17} /><p><strong>Regulatory check</strong>The recipient must satisfy the token&apos;s transfer rules before a transaction can proceed.</p></div>
            <RegisteredInvestorWalletGate guard={walletGuard} actionLabel="send tokens" />
            <Button className="investor-token-order-card__cta" icon={Send} onClick={handleSend} disabled={!canSend}>Send Tokens</Button>
            <small className="investor-token-order-card__footnote">
              {!walletGuard.ready
                ? 'Connect the registered wallet on the required network to enable this action.'
                : recipientError || !addressChecked
                  ? 'Enter and check an eligible recipient address.'
                  : amountError
                    ? 'Enter a valid transfer amount.'
                    : 'No transfer transaction is sent from this screen yet.'}
            </small>
          </Card>
        </aside>
      </div>
    </div>
  );
}
