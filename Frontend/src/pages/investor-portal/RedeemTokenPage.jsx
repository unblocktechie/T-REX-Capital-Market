import { useMemo, useState } from 'react';
import {
  Banknote,
  CalendarClock,
  Info,
  RotateCcw,
  ShieldCheck,
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
const money = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const decimalPlaces = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized.includes('e')) return 0;
  return normalized.includes('.') ? normalized.split('.')[1].length : 0;
};

export default function RedeemTokenPage() {
  const { interestUid } = useParams();
  const navigate = useNavigate();
  const { application, token, loading, error, ready } = useRegisteredInvestmentAction(interestUid);
  const [amount, setAmount] = useState('');

  useDocumentTitle(token ? `${token.name} · Redeem Tokens` : 'Redeem Tokens');

  const applicationRoute = ROUTES.applicationDetail(interestUid);
  const context = useMemo(() => getInvestmentActionContext(token || application), [application, token]);
  const walletGuard = useRegisteredInvestorWalletGuard(context.investorWalletAddress, context.chainId);
  const redeemAmount = Number(amount) > 0 ? Number(amount) : 0;
  const tokenPrice = Number(token?.initialTokenPrice ?? token?.price ?? token?.initialPrice ?? 0);
  const maxTokenBalance = Number(token?.maxBalancePerInvestor ?? token?.maxBalance ?? 0);
  const tokenDecimals = Number.isInteger(Number(token?.decimals)) ? Number(token.decimals) : null;
  const estimatedValue = redeemAmount * (Number.isFinite(tokenPrice) ? tokenPrice : 0);

  const amountError = useMemo(() => {
    if (!String(amount).trim()) return '';
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return 'Enter a token amount greater than zero.';
    if (tokenDecimals !== null && decimalPlaces(amount) > tokenDecimals) {
      return `Enter no more than ${tokenDecimals} decimal place${tokenDecimals === 1 ? '' : 's'} for ${token?.symbol || 'this token'}.`;
    }
    if (Number.isFinite(maxTokenBalance) && maxTokenBalance > 0 && parsed > maxTokenBalance) {
      return `The redemption amount cannot exceed ${number.format(maxTokenBalance)} ${token?.symbol || 'tokens'} on this application.`;
    }
    return '';
  }, [amount, maxTokenBalance, token?.symbol, tokenDecimals]);

  const canRedeem = Boolean(walletGuard.ready && redeemAmount && !amountError);

  const handleRedeem = () => {
    if (!walletGuard.ready) {
      toast.error('Connect the registered investor wallet on the required network to continue.');
      return;
    }
    if (!redeemAmount || amountError) {
      toast.error(amountError || 'Enter a token amount greater than zero.');
      return;
    }
    toast.info('Redemption execution is coming soon. No transaction has been sent.');
  };

  if (loading) {
    return <div className="page-stack investor-token-action-page"><div className="investor-token-action-loading" /><div className="investor-token-action-loading investor-token-action-loading--tall" /></div>;
  }

  if (error || !application || !token) {
    return <TokenActionUnavailable title="Redeem Tokens" description="This investment could not be loaded right now." onBack={() => navigate(ROUTES.applications)} />;
  }

  if (!ready) {
    return <TokenActionUnavailable title="Redeem Tokens" description="Redemption is not available for this application yet." onBack={() => navigate(applicationRoute)} backLabel="Back to Application" />;
  }

  return (
    <div className="page-stack investor-token-action-page">
      <InvestorTokenActionHeader
        eyebrow="Token action"
        title="Redeem Tokens"
        description="Prepare a redemption request and review the estimated settlement value."
        onBack={() => navigate(applicationRoute)}
      />

      <div className="investor-token-action-layout">
        <main className="investor-token-action-main">
          <InvestorTokenIdentityCard token={token} readyLabel="Registered investor" />

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading"><div><span>Selected token</span><h2>Redeem from your registered wallet</h2></div><WalletCards size={19} /></div>
            <LockedAddressField label="Primary Investment Wallet" value={context.investorWalletAddress} />
          </Card>

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading investor-token-action-card__heading--with-meta">
              <div><span>Redeem amount</span><h2>How many tokens would you like to redeem?</h2></div>
              {Number.isFinite(maxTokenBalance) && maxTokenBalance > 0 ? <small>Configured holder limit: {number.format(maxTokenBalance)} {token.symbol}</small> : null}
            </div>
            <label className={`investor-token-action-amount-field ${amountError ? 'is-invalid' : ''}`}>
              <span className="sr-only">Token amount to redeem</span>
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
            <p className="investor-token-action-field-hint">Your live token balance will be verified before a real redemption can be submitted.</p>
            <div className="investor-token-action-calculation"><span>Estimated redemption value</span><strong>{tokenPrice > 0 && redeemAmount ? `$${money.format(estimatedValue)} ${token.currency || ''}` : '—'}</strong></div>
          </Card>

          <Card className="investor-token-action-card investor-token-redemption-info">
            <div className="investor-token-action-card__heading"><div><span>Redemption information</span><h2>What happens next</h2></div><CalendarClock size={19} /></div>
            <div className="investor-token-action-checks">
              <TokenActionCheck icon={ShieldCheck} label="Redemption eligibility" detail="Availability and token rules will be checked before redemption execution." status="Checked at redemption" tone="neutral" />
              <TokenActionCheck icon={Banknote} label="Settlement" detail="Settlement destination and timing will be shown before you confirm a real redemption." status="Shown before confirm" tone="neutral" />
              <TokenActionCheck icon={WalletCards} label="Registered wallet" detail="The redemption can only continue from the wallet linked to this application." status={walletGuard.ready ? 'Ready' : 'Connection required'} tone={walletGuard.ready ? 'success' : 'neutral'} />
            </div>
          </Card>
        </main>

        <aside className="investor-token-action-aside">
          <Card className="investor-token-order-card">
            <div className="investor-token-order-card__title"><span>Redemption summary</span><RotateCcw size={18} /></div>
            <div className="investor-token-order-row"><span>Token Price</span><strong>{tokenPrice > 0 ? `$${money.format(tokenPrice)} ${token.currency || ''}` : '—'}</strong></div>
            <div className="investor-token-order-row"><span>Redeem Amount</span><strong>{redeemAmount ? `${number.format(redeemAmount)} ${token.symbol}` : '—'}</strong></div>
            <div className="investor-token-order-row investor-token-order-row--primary"><span>Estimated Value</span><strong>{tokenPrice > 0 && redeemAmount ? `$${money.format(estimatedValue)} ${token.currency || ''}` : '—'}</strong></div>
            <div className="investor-token-order-row"><span>Network</span><strong>{walletGuard.targetNetworkLabel}</strong></div>
            <div className="investor-token-order-row"><span>Redemption Fee</span><strong>Shown before confirmation</strong></div>
            <div className="investor-token-action-note"><Info size={17} /><p><strong>Settlement notice</strong>Final redemption terms and settlement timing will be presented before any transaction is submitted.</p></div>
            <RegisteredInvestorWalletGate guard={walletGuard} actionLabel="redeem tokens" />
            <Button className="investor-token-order-card__cta" icon={RotateCcw} onClick={handleRedeem} disabled={!canRedeem}>Redeem Tokens</Button>
            <small className="investor-token-order-card__footnote">
              {!walletGuard.ready
                ? 'Connect the registered wallet on the required network to enable this action.'
                : amountError
                  ? 'Enter a valid redemption amount.'
                  : 'No redemption transaction is sent from this screen yet.'}
            </small>
          </Card>
        </aside>
      </div>
    </div>
  );
}
