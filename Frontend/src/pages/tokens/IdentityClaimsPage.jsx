import { ArrowRight, BadgeCheck, Fingerprint, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  SectionCard,
  StatusBadge,
  Toggle,
} from '@/components/token-issuance/IssuancePrimitives';
import { IssuanceLayout } from '@/components/token-issuance/IssuanceLayout';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOrganization } from '@/hooks/useOrganization';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { validateIdentityClaims } from '@/utils/tokenIssuance';

const VISIBLE_CLAIM_IDS = new Set(['kyc', 'accredited']);

export default function IdentityClaimsPage() {
  const navigate = useNavigate();
  const wallet = useWalletConnection();
  const { organization } = useOrganization();
  const data = useTokenIssuanceStore((state) => state.identityClaims);
  const updateClaimTopic = useTokenIssuanceStore((state) => state.updateClaimTopic);
  const updateNestedSection = useTokenIssuanceStore((state) => state.updateNestedSection);
  const hydrateWalletDefaults = useTokenIssuanceStore((state) => state.hydrateWalletDefaults);
  const markStepCompleted = useTokenIssuanceStore((state) => state.markStepCompleted);
  const markStepTouched = useTokenIssuanceStore((state) => state.markStepTouched);
  const [submitted, setSubmitted] = useState(false);
  const errors = validateIdentityClaims(data);
  const visibleTopics = useMemo(
    () => data.claimTopics.filter((topic) => VISIBLE_CLAIM_IDS.has(topic.id)),
    [data.claimTopics],
  );
  useDocumentTitle('Identity & Claims');

  useEffect(() => {
    hydrateWalletDefaults(wallet.address);
  }, [hydrateWalletDefaults, wallet.address]);

  useEffect(() => {
    if (data.trustedIssuer.mode !== 'organization') return;

    const organizationName =
      organization?.company?.legalName ||
      organization?.company?.name ||
      'Verified organization';
    const organizationWallet =
      organization?.walletAddress ||
      organization?.contractAddress ||
      wallet.address ||
      '';
    const enabledTopics = visibleTopics.filter((topic) => topic.enabled).map((topic) => topic.id);
    const updates = {};

    if (data.trustedIssuer.name !== organizationName) updates.name = organizationName;
    if (!data.trustedIssuer.address && organizationWallet) updates.address = organizationWallet;
    if (
      JSON.stringify(data.trustedIssuer.claimTopics || []) !== JSON.stringify(enabledTopics)
    ) {
      updates.claimTopics = enabledTopics;
    }

    if (Object.keys(updates).length) {
      updateNestedSection('identityClaims', 'trustedIssuer', updates);
    }
  }, [
    data.trustedIssuer.address,
    data.trustedIssuer.claimTopics,
    data.trustedIssuer.mode,
    data.trustedIssuer.name,
    organization,
    updateNestedSection,
    visibleTopics,
    wallet.address,
  ]);

  const continueStep = () => {
    setSubmitted(true);
    markStepTouched('identity-claims');
    if (Object.keys(errors).length) return;
    markStepCompleted('identity-claims');
    navigate(ROUTES.tokenIssuanceStep('compliance'));
  };

  const setTopicEnabled = (topic, enabled) => {
    updateClaimTopic(topic.id, {
      enabled,
      required: enabled,
    });
  };

  const organizationActsAsIssuer = data.trustedIssuer.mode === 'organization';

  return (
    <IssuanceLayout
      stepKey="identity-claims"
      title="Identity and Claims"
      description="Configure the investor claims checked before a token transfer is allowed."
      onBack={() => navigate(ROUTES.tokenIssuanceStep('token-information'))}
      onContinue={continueStep}
      continueLabel="Confirm and Continue"
      continueIcon={ArrowRight}
      stepErrors={{ 'identity-claims': submitted && Object.keys(errors).length > 0 }}
    >
      <div className="identity-claims-simple-grid">
        <SectionCard
          title="Claim Topics"
          description="Enable at least one identity requirement used by this token."
          action={<StatusBadge status="pending">At least one required</StatusBadge>}
        >
          <div className="claim-topic-grid claim-topic-grid--simple">
            {visibleTopics.map((topic) => (
              <article
                key={topic.id}
                className={topic.enabled ? 'claim-topic-card is-enabled' : 'claim-topic-card'}
              >
                <div className="claim-topic-card__top">
                  <span className="claim-topic-card__icon">
                    <BadgeCheck size={18} />
                  </span>
                  <div>
                    <strong>{topic.name}</strong>
                    <p>{topic.description}</p>
                  </div>
                </div>
                <Toggle
                  checked={topic.enabled}
                  onChange={(enabled) => setTopicEnabled(topic, enabled)}
                  label={topic.enabled ? 'Enabled' : 'Disabled'}
                />
              </article>
            ))}
          </div>
          {submitted && errors.claimTopics ? (
            <p className="issuance-section-error" role="alert">
              {errors.claimTopics}
            </p>
          ) : null}
        </SectionCard>

        <div className="trusted-issuer-column">
          <SectionCard
            className="trusted-issuer-card"
            title="Trusted Claim Issuer"
            description="The organization creating this token will verify investor identities and issue the claims used to determine transfer eligibility."
            action={
              organizationActsAsIssuer ? (
                <StatusBadge status="valid">Selected</StatusBadge>
              ) : null
            }
          >
            <label className="issuance-check-row issuance-check-row--boxed trusted-issuer-checkbox">
              <input
                type="checkbox"
                checked={organizationActsAsIssuer}
                onChange={(event) =>
                  updateNestedSection('identityClaims', 'trustedIssuer', {
                    mode: event.target.checked ? 'organization' : '',
                  })
                }
              />
              <span>
                <strong>
                  My organization will act as the Trusted Claim Issuer for this token.
                </strong>
                <small>
                  The verified organization wallet will sign the enabled investor claims.
                </small>
              </span>
            </label>
            {submitted && errors.trustedIssuer ? (
              <p className="issuance-section-error" role="alert">
                {errors.trustedIssuer}
              </p>
            ) : null}
          </SectionCard>

          <aside className="claims-work-card" aria-label="How claims work">
            <span className="claims-work-card__icon">
              <Fingerprint size={20} />
            </span>
            <div>
              <strong>How Claims Work</strong>
              <p>
                Under ERC-3643, each investor wallet is linked to an ONCHAINID. Your trusted
                issuer signs the enabled claims, and the identity registry verifies them before
                every eligible transfer.
              </p>
              <span className="claims-work-card__note">
                <ShieldCheck size={15} /> Transfers proceed only when the required claims are valid.
              </span>
            </div>
          </aside>
        </div>
      </div>
    </IssuanceLayout>
  );
}
