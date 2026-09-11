import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  Info,
  Scale,
  Send,
  ShieldCheck,
  UserRoundCheck,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { getAddress, isAddress, parseUnits } from 'viem';
import { useParams } from 'react-router-dom';
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
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useRegisteredInvestmentAction } from '@/hooks/useRegisteredInvestmentAction';
import { useRegisteredInvestorWalletGuard } from '@/hooks/useRegisteredInvestorWalletGuard';
import { useInvestorTokenWalletBalance } from '@/hooks/useInvestorTokenWalletBalance';
import {
  isInvestorTokenTransferWalletRejection,
  submitInvestorTokenTransfer,
  waitForInvestorTokenTransferReceipt,
} from '@/services/investor/investorTokenTransferTransaction.service';
import { transactionExplorerName, transactionExplorerUrl } from '@/utils/blockExplorer';
import { getInvestmentActionContext } from '@/utils/investmentPurchase';
import { getWalletErrorMessage } from '@/utils/wallet';

const TRANSFER_STATE = Object.freeze({
  READY: 'READY',
  WALLET_CONFIRMATION: 'WALLET_CONFIRMATION',
  TRANSACTION_SUBMITTED: 'TRANSACTION_SUBMITTED',
  CONFIRMING: 'CONFIRMING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

const PENDING_TRANSFER_STATES = new Set([
  TRANSFER_STATE.WALLET_CONFIRMATION,
  TRANSFER_STATE.TRANSACTION_SUBMITTED,
  TRANSFER_STATE.CONFIRMING,
]);

const clean = (value) => String(value ?? '').trim();
const sameAddress = (left, right) => clean(left).toLowerCase() === clean(right).toLowerCase();

const normalizeDecimalInput = (value) => {
  const raw = clean(value).replace(/,/g, '');
  if (!raw) return '';
  if (!/^\d*(?:\.\d*)?$/.test(raw)) return null;
  return raw;
};

const canonicalDecimal = (value) => {
  const normalized = normalizeDecimalInput(value);
  if (normalized === null || !normalized) return '';
  const [wholeRaw = '0', fractionRaw = ''] = normalized.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  const fraction = fractionRaw.replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
};

const decimalPlaces = (value) => {
  const [, fraction = ''] = clean(value).split('.');
  return fraction.length;
};

const isPositiveDecimal = (value) => /^\d+(?:\.\d+)?$/.test(value) && /[1-9]/.test(value);

const safeParseUnits = (value, decimals) => {
  try {
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
};

const formatExactAmount = (value) => {
  const normalized = canonicalDecimal(value);
  if (!normalized) return '';
  const [whole, fraction] = normalized.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
};

const shortHash = (value) => {
  const hash = clean(value);
  if (!hash) return '';
  return hash.length > 18 ? `${hash.slice(0, 9)}…${hash.slice(-7)}` : hash;
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const transferStatusMeta = (state) => {
  switch (state) {
    case TRANSFER_STATE.WALLET_CONFIRMATION:
      return {
        label: 'Wallet Confirmation',
        title: 'Confirm the transfer in your wallet',
        detail: 'Review the recipient and token amount in your wallet before approving the transaction.',
        tone: 'pending',
        Icon: WalletCards,
      };
    case TRANSFER_STATE.TRANSACTION_SUBMITTED:
      return {
        label: 'Transaction Submitted',
        title: 'Transfer submitted',
        detail: 'Your wallet submitted the transaction. Waiting for the network to confirm the result.',
        tone: 'pending',
        Icon: Clock3,
      };
    case TRANSFER_STATE.CONFIRMING:
      return {
        label: 'Confirming',
        title: 'Transfer is confirming',
        detail: 'The transaction is on the network and is being confirmed. No additional wallet action is required.',
        tone: 'pending',
        Icon: Clock3,
      };
    case TRANSFER_STATE.COMPLETED:
      return {
        label: 'Completed',
        title: 'Transfer confirmed',
        detail: 'The network confirmed the transaction successfully. The tokens were transferred to the recipient.',
        tone: 'success',
        Icon: CheckCircle2,
      };
    case TRANSFER_STATE.FAILED:
      return {
        label: 'Failed Transfer',
        title: 'Failed Transfer',
        detail: 'The transfer did not complete successfully. No successful token transfer is being shown.',
        tone: 'error',
        Icon: XCircle,
      };
    case TRANSFER_STATE.CANCELLED:
      return {
        label: 'Transaction Cancelled',
        title: 'Transaction Cancelled',
        detail: 'The wallet request was cancelled. No successful transfer was submitted, and you can try again.',
        tone: 'neutral',
        Icon: XCircle,
      };
    case TRANSFER_STATE.READY:
    default:
      return {
        label: 'Ready',
        title: 'Ready to send',
        detail: 'The token contract makes the final decision when you confirm the transfer in your wallet.',
        tone: 'neutral',
        Icon: ShieldCheck,
      };
  }
};

const friendlyTransferError = (error) => {
  const message = getWalletErrorMessage(error, 'The token transfer could not be completed.');

  if (/execution reverted|revert|transfer failed|compliance|identity|verified|eligible|recipient/i.test(message)) {
    return 'The token contract did not allow this transfer. Confirm the recipient is eligible to receive the token and try again.';
  }
  if (/insufficient funds|gas.*funds|funds.*gas/i.test(message)) {
    return 'Your wallet does not have enough network currency to pay the transaction fee.';
  }

  return message;
};

export default function SendTokenPage({
  interestUid: interestUidOverride,
  embedded = false,
}) {
  const { interestUid: routeInterestUid } = useParams();
  const resolvedInterestUid = interestUidOverride || routeInterestUid || '';
  const { application, token, loading, error, ready } = useRegisteredInvestmentAction(resolvedInterestUid);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [addressChecked, setAddressChecked] = useState(false);
  const [transferState, setTransferState] = useState(TRANSFER_STATE.READY);
  const [txHash, setTxHash] = useState('');
  const [transferError, setTransferError] = useState('');
  const activeTransferRef = useRef(0);

  useEffect(() => () => {
    activeTransferRef.current += 1;
  }, []);

  useDocumentTitle(
    embedded ? 'Asset Management' : token ? `${token.name} · Send Tokens` : 'Send Tokens',
  );

  const context = useMemo(() => getInvestmentActionContext(token || application), [application, token]);
  const walletGuard = useRegisteredInvestorWalletGuard(context.investorWalletAddress, context.chainId);
  const {
    balance: tokenWalletBalance,
    rawBalance: tokenWalletRawBalance,
    loading: tokenWalletBalanceLoading,
    refresh: refreshTokenWalletBalance,
  } = useInvestorTokenWalletBalance({
    tokenAddress: context.tokenAddress,
    investorWalletAddress: context.investorWalletAddress,
    chainId: context.chainId || walletGuard.targetChainId,
    tokenDecimals: token?.decimals,
  });

  const parsedTokenDecimals = Number(token?.decimals);
  const tokenDecimals = Number.isSafeInteger(parsedTokenDecimals)
    && parsedTokenDecimals >= 0
    && parsedTokenDecimals <= 36
    ? parsedTokenDecimals
    : null;
  const tokenContractReady = isAddress(clean(context.tokenAddress));
  const normalizedAmount = canonicalDecimal(amount);
  const amountRaw = tokenDecimals !== null && isPositiveDecimal(normalizedAmount)
    ? safeParseUnits(normalizedAmount, tokenDecimals)
    : null;
  const balanceAvailable = typeof tokenWalletRawBalance === 'bigint';
  const transferPending = PENDING_TRANSFER_STATES.has(transferState);
  const transferCompleted = transferState === TRANSFER_STATE.COMPLETED;
  const formLocked = transferPending;

  const recipientError = useMemo(() => {
    if (!recipient.trim()) return '';
    if (!isAddress(recipient.trim())) return 'Enter a valid recipient wallet address.';
    if (sameAddress(recipient, context.investorWalletAddress)) {
      return 'Choose a recipient wallet different from your registered investment wallet.';
    }
    return '';
  }, [context.investorWalletAddress, recipient]);

  const amountError = useMemo(() => {
    if (!clean(amount)) return '';
    if (!normalizedAmount || !isPositiveDecimal(normalizedAmount)) {
      return 'Enter a token amount greater than zero.';
    }
    if (tokenDecimals === null) {
      return 'Token decimal configuration is unavailable. Refresh the page and try again.';
    }
    if (decimalPlaces(amount) > tokenDecimals || amountRaw === null) {
      return `Enter no more than ${tokenDecimals} decimal place${tokenDecimals === 1 ? '' : 's'} for ${token?.symbol || 'this token'}.`;
    }
    if (balanceAvailable && amountRaw > tokenWalletRawBalance) {
      return `The transfer amount cannot exceed your available wallet balance of ${tokenWalletBalance || '0'} ${token?.symbol || 'tokens'}.`;
    }
    return '';
  }, [amount, amountRaw, balanceAvailable, normalizedAmount, token?.symbol, tokenDecimals, tokenWalletBalance, tokenWalletRawBalance]);

  const resetFinishedState = () => {
    if ([TRANSFER_STATE.COMPLETED, TRANSFER_STATE.FAILED, TRANSFER_STATE.CANCELLED].includes(transferState)) {
      activeTransferRef.current += 1;
      setTransferState(TRANSFER_STATE.READY);
      setTxHash('');
      setTransferError('');
    }
  };

  const handleRecipientChange = (event) => {
    if (formLocked) return;
    resetFinishedState();
    setRecipient(event.target.value);
    setAddressChecked(false);
  };

  const handleAmountChange = (event) => {
    if (formLocked) return;
    const normalized = normalizeDecimalInput(event.target.value);
    if (normalized === null) return;
    resetFinishedState();
    setAmount(normalized);
  };

  const checkRecipient = () => {
    if (!recipient.trim() || recipientError) {
      setAddressChecked(false);
      toast.error(recipientError || 'Enter a recipient wallet address to continue.');
      return;
    }
    setAddressChecked(true);
    toast.success('Recipient address validated.', {
      description: 'Final transfer eligibility is enforced by the token contract when you send.',
    });
  };

  const canSend = Boolean(
    walletGuard.ready
      && addressChecked
      && isAddress(recipient.trim())
      && !recipientError
      && tokenContractReady
      && tokenDecimals !== null
      && balanceAvailable
      && amountRaw !== null
      && amountRaw > 0n
      && amountRaw <= tokenWalletRawBalance
      && !amountError
      && !transferPending
      && !transferCompleted,
  );

  const monitorSubmittedTransfer = async ({ hash, transferId }) => {
    // Keep TRANSACTION_SUBMITTED visible briefly before moving into the longer
    // confirmation state. Completion still depends exclusively on the receipt.
    await wait(450);
    if (activeTransferRef.current !== transferId) return;
    setTransferState(TRANSFER_STATE.CONFIRMING);

    while (activeTransferRef.current === transferId) {
      try {
        await waitForInvestorTokenTransferReceipt({
          txHash: hash,
          chainId: context.chainId || walletGuard.targetChainId,
          timeout: 30_000,
        });

        if (activeTransferRef.current !== transferId) return;
        setTransferState(TRANSFER_STATE.COMPLETED);
        setTransferError('');
        refreshTokenWalletBalance?.();
        toast.success('Transfer confirmed', {
          description: 'The token transfer was confirmed successfully on the network.',
        });
        return;
      } catch (confirmationError) {
        if (activeTransferRef.current !== transferId) return;
        if (confirmationError?.code === 'TRANSFER_REVERTED' || confirmationError?.confirmedRevert) {
          setTransferState(TRANSFER_STATE.FAILED);
          setTransferError(friendlyTransferError(confirmationError));
          toast.error('Failed Transfer', {
            description: 'The transaction was confirmed but did not succeed. No tokens were transferred.',
          });
          return;
        }

        // A timeout/RPC interruption cannot safely be treated as a failed
        // transfer. Keep confirming and retry the read without resubmitting.
        setTransferState(TRANSFER_STATE.CONFIRMING);
        await wait(5_000);
      }
    }
  };

  const handleSend = async () => {
    if (!walletGuard.ready) {
      toast.error('Connect the registered investor wallet on the required network to continue.');
      return;
    }
    if (!tokenContractReady) {
      toast.error('The token contract is unavailable. Refresh the page and try again.');
      return;
    }
    if (tokenDecimals === null) {
      toast.error('The token decimal configuration is unavailable. Refresh the page and try again.');
      return;
    }
    if (!addressChecked || recipientError || !isAddress(recipient.trim())) {
      toast.error(recipientError || 'Enter and validate a recipient wallet address.');
      return;
    }
    if (tokenWalletBalanceLoading) {
      toast.info('Your token balance is still loading.');
      return;
    }
    if (!balanceAvailable) {
      toast.error('Your token balance could not be verified. Refresh the page and try again before sending.');
      return;
    }
    if (!amountRaw || amountRaw <= 0n || amountError) {
      toast.error(amountError || 'Enter a token amount greater than zero.');
      return;
    }

    const transferId = activeTransferRef.current + 1;
    activeTransferRef.current = transferId;
    setTransferError('');
    setTxHash('');
    setTransferState(TRANSFER_STATE.WALLET_CONFIRMATION);

    try {
      const recipientAddress = getAddress(recipient.trim());
      const tokenAddress = getAddress(context.tokenAddress);
      const transferAmount = canonicalDecimal(amount);
      const hash = await submitInvestorTokenTransfer({
        connector: walletGuard.wallet.connector,
        connectedAddress: walletGuard.wallet.address,
        investorWalletAddress: context.investorWalletAddress,
        tokenAddress,
        recipient: recipientAddress,
        amount: transferAmount,
        tokenDecimals,
        chainId: context.chainId || walletGuard.targetChainId,
      });

      if (activeTransferRef.current !== transferId) return;
      setTxHash(hash);
      setTransferState(TRANSFER_STATE.TRANSACTION_SUBMITTED);

      const payload = {
        txHash: hash,
        tokenAddress,
        recipient: recipientAddress,
        amount: transferAmount,
      };
      // Backend indexing is intentionally unavailable for this flow right now.
      // eslint-disable-next-line no-console
      console.log('Transfer payload (API pending):', payload);

      toast.info('Transaction submitted', {
        description: 'Waiting for the network to confirm the transfer.',
      });

      void monitorSubmittedTransfer({ hash, transferId });
    } catch (sendError) {
      if (activeTransferRef.current !== transferId) return;
      if (isInvestorTokenTransferWalletRejection(sendError)) {
        setTransferState(TRANSFER_STATE.CANCELLED);
        setTransferError('');
        toast.info('Transaction Cancelled', {
          description: 'The wallet request was cancelled. You can try again when ready.',
        });
        return;
      }

      setTransferState(TRANSFER_STATE.FAILED);
      const message = friendlyTransferError(sendError);
      setTransferError(message);
      toast.error('Failed Transfer', { description: message });
    }
  };

  if (loading) {
    return <div className="page-stack investor-token-action-page"><div className="investor-token-action-loading" /><div className="investor-token-action-loading investor-token-action-loading--tall" /></div>;
  }

  if (error || !application || !token) {
    return (
      <TokenActionUnavailable
        title="Send Tokens"
        description="This investment could not be loaded right now."
      />
    );
  }

  if (!ready) {
    return (
      <TokenActionUnavailable
        title="Send Tokens"
        description="Token transfers are not available for this application yet."
      />
    );
  }

  const statusMeta = transferStatusMeta(transferState);
  const StatusIcon = statusMeta.Icon;
  const explorerUrl = transactionExplorerUrl(txHash, context.chainId || walletGuard.targetChainId);
  const explorerName = transactionExplorerName(context.chainId || walletGuard.targetChainId);
  const formattedAmount = formatExactAmount(amount);
  const amountWithinBalance = Boolean(
    amountRaw !== null
      && typeof tokenWalletRawBalance === 'bigint'
      && amountRaw > 0n
      && amountRaw <= tokenWalletRawBalance,
  );

  const ctaLabel = transferState === TRANSFER_STATE.WALLET_CONFIRMATION
    ? 'Confirm in Wallet'
    : [TRANSFER_STATE.TRANSACTION_SUBMITTED, TRANSFER_STATE.CONFIRMING].includes(transferState)
      ? 'Confirming Transfer'
      : transferState === TRANSFER_STATE.COMPLETED
        ? 'Transfer Confirmed'
        : [TRANSFER_STATE.FAILED, TRANSFER_STATE.CANCELLED].includes(transferState)
          ? 'Try Again'
          : 'Send Tokens';

  const ctaFootnote = transferState === TRANSFER_STATE.COMPLETED
    ? 'Edit the recipient or amount to prepare another transfer.'
    : transferState === TRANSFER_STATE.CANCELLED
      ? 'No transaction was sent successfully. You can try the transfer again.'
      : transferState === TRANSFER_STATE.FAILED
        ? 'Review the details above and try again when ready.'
        : transferPending
          ? 'Keep this page open while the submitted transaction is being confirmed.'
          : !walletGuard.ready
            ? 'Connect the registered wallet on the required network to enable this action.'
            : !tokenContractReady || tokenDecimals === null
              ? 'The token contract configuration must be available before a transfer can be sent.'
              : tokenWalletBalanceLoading
                ? 'Loading your current token balance…'
                : !balanceAvailable
                  ? 'Your token balance must be available before a transfer can be sent.'
                  : recipientError || !addressChecked
                    ? 'Enter and validate the recipient wallet address.'
                    : amountError || !amountRaw
                      ? 'Enter a valid transfer amount within your available balance.'
                      : 'The token contract will make the final transfer decision when you confirm in your wallet.';

  return (
    <div className="page-stack investor-token-action-page investor-token-send-page">
      {!embedded ? (
        <InvestorTokenActionHeader
          eyebrow="Token action"
          title="Send Tokens"
          description="Send your registered ERC-3643 tokens directly to another eligible investor wallet."
        />
      ) : null}

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
              <label className={`investor-token-action-text-field ${addressChecked && !recipientError ? 'is-checked' : ''} ${recipientError ? 'is-invalid' : ''} ${formLocked ? 'is-locked' : ''}`}>
                <span className="sr-only">Recipient wallet address</span>
                <input
                  value={recipient}
                  onChange={handleRecipientChange}
                  placeholder="0x… recipient wallet address"
                  spellCheck="false"
                  autoComplete="off"
                  aria-invalid={Boolean(recipientError)}
                  disabled={formLocked}
                />
                {addressChecked && !recipientError ? <CheckCircle2 size={17} /> : null}
              </label>
              <Button
                variant="secondary"
                onClick={checkRecipient}
                disabled={formLocked || !recipient.trim() || Boolean(recipientError)}
              >
                Validate Address
              </Button>
            </div>
            {recipientError ? <p className="investor-token-action-field-error">{recipientError}</p> : null}
            <p className="investor-token-action-helper">This validates the wallet address only. The ERC-3643 token contract enforces the final recipient eligibility and transfer rules when you submit.</p>
          </Card>

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading investor-token-action-card__heading--with-meta">
              <div><span>Amount to transfer</span><h2>Enter the token amount</h2></div>
              <small>
                {tokenWalletBalanceLoading
                  ? 'Available to send: Loading…'
                  : balanceAvailable
                    ? `Available to send: ${tokenWalletBalance} ${token.symbol}`
                    : 'Available balance unavailable'}
              </small>
            </div>
            <label className={`investor-token-action-amount-field ${amountError ? 'is-invalid' : ''} ${formLocked ? 'is-locked' : ''}`}>
              <span className="sr-only">Token amount to transfer</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={handleAmountChange}
                placeholder="0.00"
                aria-invalid={Boolean(amountError)}
                disabled={formLocked}
              />
              <strong>{token.symbol}</strong>
            </label>
            {amountError ? <p className="investor-token-action-field-error">{amountError}</p> : null}
            {!amountError && !tokenWalletBalanceLoading && !balanceAvailable ? (
              <p className="investor-token-action-field-error">Your current token balance could not be verified. Refresh the page before sending tokens.</p>
            ) : null}
            <p className="investor-token-action-field-hint">Enter an amount greater than zero and no more than your available token balance.</p>
          </Card>

          <Card className="investor-token-action-card">
            <div className="investor-token-action-card__heading"><div><span>Transfer checks</span><h2>Ready for wallet confirmation</h2></div><ShieldCheck size={19} /></div>
            <div className="investor-token-action-checks">
              <TokenActionCheck
                icon={UserRoundCheck}
                label="Recipient address"
                detail="The address is checked for a valid EVM format before your wallet opens."
                status={addressChecked && !recipientError ? 'Address ready' : 'Check required'}
                tone={addressChecked && !recipientError ? 'success' : 'neutral'}
              />
              <TokenActionCheck
                icon={WalletCards}
                label="Available balance"
                detail="The amount is checked against your current token balance before submission."
                status={amountWithinBalance ? 'Amount ready' : tokenWalletBalanceLoading ? 'Loading' : 'Check required'}
                tone={amountWithinBalance ? 'success' : 'neutral'}
              />
              <TokenActionCheck
                icon={Scale}
                label="ERC-3643 transfer rules"
                detail="Recipient eligibility and holder restrictions are enforced by the token contract when the transaction is submitted."
                status={tokenContractReady ? 'On-chain' : 'Unavailable'}
                tone={tokenContractReady ? 'success' : 'neutral'}
              />
            </div>
          </Card>
        </main>

        <aside className="investor-token-action-aside">
          <Card className="investor-token-order-card">
            <div className="investor-token-order-card__title"><span>Transfer summary</span><Send size={18} /></div>
            <div className="investor-token-order-row"><span>Send Amount</span><strong>{formattedAmount ? `${formattedAmount} ${token.symbol}` : '—'}</strong></div>
            <div className="investor-token-order-row"><span>Recipient</span><strong className="investor-token-order-address">{recipient || 'Not entered'}</strong></div>
            <div className="investor-token-order-row"><span>Network</span><strong>{walletGuard.targetNetworkLabel}</strong></div>
            <div className="investor-token-order-row">
              <span>Wallet Balance</span>
              <strong>
                {tokenWalletBalanceLoading
                  ? 'Loading…'
                  : balanceAvailable
                    ? `${tokenWalletBalance} ${token.symbol || ''}`
                    : `— ${token.symbol || ''}`}
              </strong>
            </div>
            <div className="investor-token-order-row investor-token-transfer-status-row">
              <span>Status</span>
              <strong><span className={`investor-token-transfer-status-badge is-${statusMeta.tone}`}>{statusMeta.label}</span></strong>
            </div>
            {txHash ? (
              <div className="investor-token-order-row investor-token-transfer-hash-row">
                <span>Transaction</span>
                <strong>
                  {explorerUrl ? (
                    <a href={explorerUrl} target="_blank" rel="noopener noreferrer" title={`View transaction on ${explorerName}`}>
                      {shortHash(txHash)} <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  ) : shortHash(txHash)}
                </strong>
              </div>
            ) : null}

            <div className={`investor-token-transfer-state is-${statusMeta.tone}`} role="status" aria-live="polite">
              <StatusIcon size={17} aria-hidden="true" />
              <div>
                <strong>{statusMeta.title}</strong>
                <p>{transferError || statusMeta.detail}</p>
              </div>
            </div>

            <div className="investor-token-action-note"><Info size={17} /><p><strong>On-chain transfer rules</strong>The token contract validates whether the transfer is allowed when you confirm it in your wallet. There is no additional approval step before the wallet request.</p></div>
            <RegisteredInvestorWalletGate guard={walletGuard} actionLabel="send tokens" />
            <Button
              className="investor-token-order-card__cta"
              icon={transferCompleted ? CheckCircle2 : Send}
              onClick={handleSend}
              disabled={!canSend || transferPending || transferCompleted}
              loading={transferPending}
            >
              {ctaLabel}
            </Button>
            <small className="investor-token-order-card__footnote">{ctaFootnote}</small>
          </Card>
        </aside>
      </div>
    </div>
  );
}
