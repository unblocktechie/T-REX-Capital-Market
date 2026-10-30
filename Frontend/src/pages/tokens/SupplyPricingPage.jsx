import { isTokenCreationLocked } from '@/utils/tokenCreationLock';
import { PaymentTokenSelect } from '@/components/token-issuance/PaymentTokenSelect';
import { TokenPriceValue } from '@/components/common/TokenPriceValue';
import { ArrowRight, Calculator, Coins, LockKeyhole } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FieldWrapper, InfoCallout, SectionCard, TextareaInput, TextInput } from '@/components/token-issuance/IssuancePrimitives';
import { IssuanceLayout } from '@/components/token-issuance/IssuanceLayout';
import { usePaymentTokens } from '@/hooks/usePaymentTokens';
import { supportsPaymentAction } from '@/config/payment-tokens';
import { web3Config } from '@/config/web3';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import {
  decimalStepFor,
  formatMoney,
  formatNumber,
  getImpliedValuation,
  isDecimalInputWithinPrecision,
  normalizePaymentTokenDecimals,
  validateSupplyPricing,
} from '@/utils/tokenIssuance';

export default function SupplyPricingPage() {
  const navigate = useNavigate();
  const tokenInformation = useTokenIssuanceStore((state) => state.tokenInformation);
  const selectedChain = web3Config.getChainRecordByUid(tokenInformation.chainUid);
  const catalogue = usePaymentTokens({ chainUid: tokenInformation.chainUid, action: 'purchase', enabled: Boolean(tokenInformation.chainUid) });
  const options = (catalogue.data || []).filter((item) => supportsPaymentAction(item, 'create'));
  const wallet = useWalletConnection(tokenInformation.chainId);
  const data = useTokenIssuanceStore((state) => state.supplyPricing);
  const selectedPayment = (catalogue.data || []).find((item) =>
    item.contractAddress.toLowerCase() === String(data.paymentTokenAddress || '').toLowerCase());
  const paymentTokenDecimals = normalizePaymentTokenDecimals(
    selectedPayment?.decimals ?? data.paymentTokenDecimals,
  );
  const priceStep = decimalStepFor(paymentTokenDecimals);
  const pricePrecisionHint = paymentTokenDecimals === 0
    ? 'Use whole numbers only.'
    : `Use at most ${paymentTokenDecimals} decimal place${paymentTokenDecimals === 1 ? '' : 's'}.`;
  const backend = useTokenIssuanceStore((state) => state.backend);
  const deployment = useTokenIssuanceStore((state) => state.deployment);
  const paymentLocked = Boolean(data.paymentTokenLocked || isTokenCreationLocked(backend, deployment));
  const updateSection = useTokenIssuanceStore((state) => state.updateSection);
  const hydrateWalletDefaults = useTokenIssuanceStore((state) => state.hydrateWalletDefaults);
  const markStepCompleted = useTokenIssuanceStore((state) => state.markStepCompleted);
  const markStepTouched = useTokenIssuanceStore((state) => state.markStepTouched);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const errors = validateSupplyPricing(data, { paymentTokenDecimals });
  const valuation = getImpliedValuation(data.totalSupply, data.initialPrice);
  useDocumentTitle('Supply & Pricing');

  useEffect(() => {
    hydrateWalletDefaults(wallet.address);
  }, [hydrateWalletDefaults, wallet.address]);

  const update = (name, value) => updateSection('supplyPricing', { [name]: value });
  const blur = (name) => setTouched((current) => ({ ...current, [name]: true }));
  const fieldError = (name) => (submitted || touched[name] ? errors[name] : undefined);
  const continueStep = () => {
    setSubmitted(true);
    markStepTouched('supply-pricing');
    if (Object.keys(errors).length) return;
    markStepCompleted('supply-pricing');
    navigate(ROUTES.tokenIssuanceStep('identity-claims'));
  };

  const summary = (
    <section className="issuance-summary-card issuance-summary-card--sticky">
      <span className="issuance-card-icon"><Calculator size={19} /></span>
      <h3>Live issuance summary</h3>
      <dl className="issuance-summary-list">
        <div><dt>Total supply</dt><dd>{data.totalSupply ? formatNumber(data.totalSupply) : '—'}</dd></div>
        <div><dt>Token price</dt><dd>{data.initialPrice ? <TokenPriceValue value={data.initialPrice} suffix={data.currency ? ` ${data.currency}` : ''} /> : '—'}</dd></div>
        <div><dt>Implied initial valuation</dt><dd>{valuation !== null ? formatMoney(valuation, data.currency) : '—'}</dd></div>
        <div><dt>Minimum investment</dt><dd>{data.minimumInvestment ? formatMoney(data.minimumInvestment, data.currency) : '—'}</dd></div>
        <div><dt>Maximum investment</dt><dd>{data.maximumInvestment ? formatMoney(data.maximumInvestment, data.currency) : '—'}</dd></div>
      </dl>
      <InfoCallout title="Pricing context" icon={Coins}>
        This summary is calculated from your current entries and does not include any network fee shown during final confirmation.
      </InfoCallout>
    </section>
  );

  return (
    <IssuanceLayout
      stepKey="supply-pricing"
      title="Supply & Pricing"
      description="Define the initial supply, investment limits and distribution model."
      sidebar={summary}
      onBack={() => navigate(ROUTES.tokenIssuanceStep('token-information'))}
      onContinue={continueStep}
      continueLabel="Continue to Investor Verification"
      continueIcon={ArrowRight}
    >
      <SectionCard title="Supply model" description="Choose how token supply can be issued after the token is created.">
        <div className="issuance-radio-grid">
          {[
            ['fixed', 'Fixed supply', 'The maximum supply cannot be increased after the token is created.'],
            ['mintable', 'Flexible supply', 'Authorized token operations can issue additional supply when needed.'],
          ].map(([value, title, description]) => (
            <label key={value} className={data.mintingModel === value ? 'issuance-radio-card is-selected' : 'issuance-radio-card'}>
              <input type="radio" name="minting-model" value={value} checked={data.mintingModel === value} onChange={() => update('mintingModel', value)} />
              <span><strong>{title}</strong><small>{description}</small></span>
            </label>
          ))}
        </div>
        <div className="issuance-form-grid issuance-form-grid--spaced">
          <FieldWrapper label="Total token supply" required error={fieldError('totalSupply')} hint="Maximum initial number of tokens available." htmlFor="total-supply">
            <TextInput id="total-supply" type="number" min="0" step="any" inputMode="decimal" value={data.totalSupply} onChange={(event) => update('totalSupply', event.target.value)} onBlur={() => blur('totalSupply')} placeholder="1000000" error={fieldError('totalSupply')} />
          </FieldWrapper>
          <FieldWrapper label="Initial token price" required error={fieldError('initialPrice')} hint={`Price per token at the start of the offering. ${pricePrecisionHint}`} htmlFor="initial-price">
            <TextInput
              id="initial-price"
              type="number"
              min={priceStep}
              step={priceStep}
              inputMode="decimal"
              value={data.initialPrice}
              onKeyDown={(event) => {
                if (['-', '+', 'e', 'E'].includes(event.key)) event.preventDefault();
              }}
              onChange={(event) => {
                const nextValue = event.target.value;
                if (!isDecimalInputWithinPrecision(nextValue, paymentTokenDecimals)) return;
                update('initialPrice', nextValue);
              }}
              onBlur={() => blur('initialPrice')}
              placeholder="10.00"
              error={fieldError('initialPrice')}
            />
          </FieldWrapper>
          <PaymentTokenSelect id="price-currency" label="Payment token" required items={options}
            value={data.paymentTokenAddress || ''} disabled={paymentLocked || catalogue.isPending}
            placeholder={catalogue.isPending ? 'Loading payment tokens…' : 'Select payment token'}
            hint={paymentLocked ? 'Payment token is fixed after creation.' : 'You can change this during setup. It becomes fixed when you create the token.'}
            error={fieldError('currency') || (catalogue.isError ? 'Unable to load payment tokens. Refresh and try again.' : undefined)}
            onChange={(event) => {
              const selected = options.find((item) => item.contractAddress === event.target.value);
              if (selected && data.initialPrice
                && !isDecimalInputWithinPrecision(data.initialPrice, selected.decimals)) {
                setTouched((current) => ({ ...current, initialPrice: true }));
              }
              updateSection('supplyPricing', {
                paymentTokenAddress: selected?.contractAddress || '',
                paymentTokenDecimals: selected?.decimals ?? null,
                controllerAddress: selected
                  ? selected.controllerAddress || selectedChain?.platformControllerAddress || ''
                  : '',
                currency: selected?.symbol || '',
              });
            }} />
          <FieldWrapper label="Lock-up period" error={fieldError('lockupDays')} hint="Optional number of calendar days." htmlFor="supply-lockup">
            <TextInput id="supply-lockup" type="number" min="0" inputMode="numeric" value={data.lockupDays} onChange={(event) => update('lockupDays', event.target.value)} onBlur={() => blur('lockupDays')} placeholder="0" error={fieldError('lockupDays')} />
          </FieldWrapper>
        </div>
      </SectionCard>

      <SectionCard title="Investment and purchase limits" description="Use limits that reflect the approved offering and investor policy.">
        <div className="issuance-form-grid">
          <FieldWrapper label="Minimum investment" required error={fieldError('minimumInvestment')} htmlFor="minimum-investment">
            <TextInput id="minimum-investment" type="number" min="0" step="any" inputMode="decimal" value={data.minimumInvestment} onChange={(event) => update('minimumInvestment', event.target.value)} onBlur={() => blur('minimumInvestment')} placeholder="1000" error={fieldError('minimumInvestment')} />
          </FieldWrapper>
          <FieldWrapper label="Maximum investment" required error={fieldError('maximumInvestment')} htmlFor="maximum-investment">
            <TextInput id="maximum-investment" type="number" min="0" step="any" inputMode="decimal" value={data.maximumInvestment} onChange={(event) => update('maximumInvestment', event.target.value)} onBlur={() => blur('maximumInvestment')} placeholder="100000" error={fieldError('maximumInvestment')} />
          </FieldWrapper>
          <FieldWrapper label="Minimum token purchase" required error={fieldError('minimumTokenPurchase')} htmlFor="minimum-purchase">
            <TextInput id="minimum-purchase" type="number" min="0" step="any" inputMode="decimal" value={data.minimumTokenPurchase} onChange={(event) => update('minimumTokenPurchase', event.target.value)} onBlur={() => blur('minimumTokenPurchase')} placeholder="100" error={fieldError('minimumTokenPurchase')} />
          </FieldWrapper>
          <FieldWrapper label="Maximum token purchase" required error={fieldError('maximumTokenPurchase')} htmlFor="maximum-purchase">
            <TextInput id="maximum-purchase" type="number" min="0" step="any" inputMode="decimal" value={data.maximumTokenPurchase} onChange={(event) => update('maximumTokenPurchase', event.target.value)} onBlur={() => blur('maximumTokenPurchase')} placeholder="10000" error={fieldError('maximumTokenPurchase')} />
          </FieldWrapper>
        </div>
      </SectionCard>

      <SectionCard title="Treasury and allocation" description="Document how issued supply will be held and distributed.">
        <div className="issuance-form-grid">
          <FieldWrapper className="issuance-field--full" label="Treasury wallet address" required error={fieldError('treasuryWallet')} htmlFor="supply-treasury">
            <TextInput id="supply-treasury" value={data.treasuryWallet} onChange={(event) => update('treasuryWallet', event.target.value.trim())} onBlur={() => blur('treasuryWallet')} placeholder="0x…" spellCheck="false" error={fieldError('treasuryWallet')} />
          </FieldWrapper>
          <FieldWrapper className="issuance-field--full" label="Distribution or allocation information" required error={fieldError('allocation')} hint="Example: 70% investor allocation, 20% reserve, 10% operating treasury." htmlFor="allocation-information">
            <TextareaInput id="allocation-information" rows="4" value={data.allocation} onChange={(event) => update('allocation', event.target.value)} onBlur={() => blur('allocation')} placeholder="Describe initial allocation and vesting assumptions." error={fieldError('allocation')} maxLength={600} />
          </FieldWrapper>
        </div>
        <InfoCallout title="Lock-up alignment" icon={LockKeyhole} tone="warning">
          Ensure token and compliance lock-up rules reflect the same approved offering terms.
        </InfoCallout>
      </SectionCard>
    </IssuanceLayout>
  );
}
