import { ArrowRight, BadgeCheck, Fingerprint, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { tokenApi } from '@/api/tokens';
import { toClaimsPayload } from '@/api/tokens/token.mapper';
import {
  SectionCard,
  StatusBadge,
  Toggle,
} from '@/components/token-issuance/IssuancePrimitives';
import { IssuanceLayout } from '@/components/token-issuance/IssuanceLayout';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOrganization } from '@/hooks/useOrganization';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { mapTokenApiFieldErrors, getTokenApiErrorMessage } from '@/utils/tokenApiValidation';
import { validateIdentityClaims } from '@/utils/tokenIssuance';

const CLAIM_FIELD_MAP = {
  claimTopicUids: 'claimTopics',
  organizationActsAsTrustedClaimIssuer: 'trustedIssuer',
};

export default function IdentityClaimsPage() {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const data = useTokenIssuanceStore((state) => state.identityClaims);
  const backend = useTokenIssuanceStore((state) => state.backend);
  const updateClaimTopic = useTokenIssuanceStore((state) => state.updateClaimTopic);
  const updateNestedSection = useTokenIssuanceStore((state) => state.updateNestedSection);
  const hydrateTrustedIssuer = useTokenIssuanceStore((state) => state.hydrateTrustedIssuer);
  const hydrateWalletDefaults = useTokenIssuanceStore((state) => state.hydrateWalletDefaults);
  const markStepCompleted = useTokenIssuanceStore((state) => state.markStepCompleted);
  const markStepTouched = useTokenIssuanceStore((state) => state.markStepTouched);
  const recordBackendSave = useTokenIssuanceStore((state) => state.recordBackendSave);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const errors = validateIdentityClaims(data);
  const visibleTopics = useMemo(() => data.claimTopics || [], [data.claimTopics]);
  useDocumentTitle('Investor Verification');

  useEffect(() => {
    hydrateWalletDefaults(organization?.walletAddress || '');
  }, [hydrateWalletDefaults, organization?.walletAddress]);

  useEffect(() => {
    if (data.trustedIssuer.mode !== 'organization') return;

    const organizationName =
      organization?.company?.legalName ||
      organization?.company?.name ||
      'Verified organization';
    const organizationWallet = organization?.walletAddress || '';
    const enabledTopics = visibleTopics.filter((topic) => topic.enabled).map((topic) => topic.id);
    const updates = {};

    if (data.trustedIssuer.name !== organizationName) updates.name = organizationName;
    if (organizationWallet && data.trustedIssuer.address !== organizationWallet) {
      updates.address = organizationWallet;
    }
    if (JSON.stringify(data.trustedIssuer.claimTopics || []) !== JSON.stringify(enabledTopics)) {
      updates.claimTopics = enabledTopics;
    }

    if (Object.keys(updates).length) {
      hydrateTrustedIssuer(updates);
    }
  }, [
    data.trustedIssuer.address,
    data.trustedIssuer.claimTopics,
    data.trustedIssuer.mode,
    data.trustedIssuer.name,
    hydrateTrustedIssuer,
    organization,
    visibleTopics,
  ]);

  const continueStep = async () => {
    if (saving || backend.isLocked) return;
    setSubmitted(true);
    setServerErrors({});
    markStepTouched('identity-claims');
    if (Object.keys(errors).length) return;

    setSaving(true);
    try {
      const response = await tokenApi.saveClaims(toClaimsPayload(data, false));
      recordBackendSave('identity-claims', response);
      markStepCompleted('identity-claims');
      toast.success('Investor verification requirements saved.');
      navigate(ROUTES.tokenIssuanceStep('compliance'));
    } catch (error) {
      setServerErrors(mapTokenApiFieldErrors(error, CLAIM_FIELD_MAP));
      toast.error('Investor verification settings were not saved.', {
        description: getTokenApiErrorMessage(
          error,
          'Review the selected verification requirements and verification provider.',
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  const setTopicEnabled = (topic, enabled) => {
    setServerErrors((current) => ({ ...current, claimTopics: '' }));
    updateClaimTopic(topic.id, {
      enabled,
      required: enabled,
    });
  };

  const organizationActsAsIssuer = data.trustedIssuer.mode === 'organization';
  const claimsError = serverErrors.claimTopics || (submitted ? errors.claimTopics : '');
  const trustedIssuerError =
    serverErrors.trustedIssuer || (submitted ? errors.trustedIssuer : '');

  return (
    <IssuanceLayout
      stepKey="identity-claims"
      title="Investor Verification"
      description="Choose the identity and eligibility checks an investor must complete before they can hold or receive this token."
      onBack={() => navigate(ROUTES.tokenIssuanceStep('token-information'))}
      onContinue={continueStep}
      continueLabel="Save and Continue"
      continueIcon={ArrowRight}
      continueLoading={saving}
      continueDisabled={!visibleTopics.length}
      stepErrors={{
        'identity-claims': submitted && (Object.keys(errors).length > 0 || Object.keys(serverErrors).length > 0),
      }}
    >
      <div className="identity-claims-simple-grid">
        <SectionCard
          title="Verification Requirements"
          description="Choose at least one check investors must complete before they can use this token."
          action={<StatusBadge status="pending">At least one required</StatusBadge>}
        >
          {visibleTopics.length ? (
            <div className="claim-topic-grid claim-topic-grid--simple">
              {visibleTopics.map((topic) => {
                const unavailable = !topic.claimTopicUid || topic.available === false;
                return (
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
                        {unavailable ? (
                          <small className="claim-topic-card__unavailable">
                            This verification requirement is not fully configured. Reload the page or
                            contact an administrator.
                          </small>
                        ) : null}
                      </div>
                    </div>
                    <Toggle
                      checked={topic.enabled}
                      onChange={(enabled) => setTopicEnabled(topic, enabled)}
                      label={topic.enabled ? 'Enabled' : unavailable ? 'Unavailable' : 'Disabled'}
                      disabled={unavailable || backend.isLocked}
                    />
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="issuance-empty-inline" role="status">
              <BadgeCheck size={18} />
              <span>
                No verification requirements are available for this token. Reload the page or ask an
                administrator to configure them.
              </span>
            </div>
          )}
          {claimsError ? (
            <p className="issuance-section-error" role="alert">
              {claimsError}
            </p>
          ) : null}
        </SectionCard>

        <div className="trusted-issuer-column">
          <SectionCard
            className="trusted-issuer-card"
            title="Verification Provider"
            description="Your organization will approve investor verification credentials used to determine whether a wallet can hold or receive this token."
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
                disabled={backend.isLocked}
                onChange={(event) => {
                  setServerErrors((current) => ({ ...current, trustedIssuer: '' }));
                  updateNestedSection('identityClaims', 'trustedIssuer', {
                    mode: event.target.checked ? 'organization' : '',
                  });
                }}
              />
              <span>
                <strong>
                  My organization will approve investor verification for this token.
                </strong>
                <small>
                  Your approved Organization Wallet will confirm the selected verification requirements when an investor is reviewed.
                </small>
              </span>
            </label>
            {trustedIssuerError ? (
              <p className="issuance-section-error" role="alert">
                {trustedIssuerError}
              </p>
            ) : null}
          </SectionCard>

          <aside className="claims-work-card" aria-label="How investor verification works">
            <span className="claims-work-card__icon">
              <Fingerprint size={20} />
            </span>
            <div>
              <strong>How Investor Verification Works</strong>
              <p>
                Each approved wallet is linked to a verified on-chain identity. Your organization confirms the selected verification requirements, and the token checks them automatically before a transfer. Technical standard: ERC-3643.
              </p>
              <span className="claims-work-card__note">
                <ShieldCheck size={15} /> Transfers proceed only when the required verification is valid.
              </span>
            </div>
          </aside>
        </div>
      </div>
    </IssuanceLayout>
  );
}
