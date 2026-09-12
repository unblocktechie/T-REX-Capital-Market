import { ArrowRight, BadgeCheck, Fingerprint, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { tokenApi } from '@/api/tokens';
import { toClaimsPayload } from '@/api/tokens/token.mapper';
import {
  HelpDetails,
  ImpactNote,
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

const getTopicCopy = (topic) => {
  if (topic.id === 'kyc') {
    return {
      title: 'Require identity verification',
      description: 'Investors must confirm who they are before they can invest in or receive this asset.',
      helpTitle: 'What is identity verification?',
      help: 'It confirms that an investor is a real person or organization using information such as their name, address, and identification.',
      enabledImpact: 'An investor cannot participate until their identity has been approved.',
      disabledImpact: 'Investors will not be asked to complete identity verification for this asset.',
    };
  }

  if (topic.id === 'accredited') {
    return {
      title: 'Require accredited investor status',
      description: 'Only investors who meet the required financial eligibility rules will be approved.',
      helpTitle: 'What does accredited investor mean?',
      help: 'Some offerings may only be available to investors who meet specific financial or professional requirements. Your legal or compliance team can confirm whether this applies to your offering.',
      enabledImpact: 'Only investors whose accredited status is approved can participate.',
      disabledImpact: 'Accredited investor status will not be required by this asset.',
    };
  }

  return {
    title: topic.shortName || topic.name || 'Investor check',
    description: topic.description || 'Investors must complete this check before they can participate.',
    helpTitle: 'What does this check mean?',
    help: topic.description || 'This check is used to decide whether an investor is eligible to participate.',
    enabledImpact: 'Investors must pass this check before they can participate.',
    disabledImpact: 'This check will not be required for investors.',
  };
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
  useDocumentTitle('Who Can Invest');

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
      toast.success('Investor requirements saved.');
      navigate(ROUTES.tokenIssuanceStep('compliance'));
    } catch (error) {
      setServerErrors(mapTokenApiFieldErrors(error, CLAIM_FIELD_MAP));
      toast.error('Investor requirements were not saved.', {
        description: getTokenApiErrorMessage(
          error,
          'Review the selected investor checks and who will approve investors.',
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
      title="Who Can Invest"
      description="Choose the checks an investor must pass before they can invest in or receive this asset."
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
          title="Choose investor checks"
          description="Choose at least one check. Every investor must pass all checks you turn on."
          action={<StatusBadge status="pending">Choose at least one</StatusBadge>}
        >
          {visibleTopics.length ? (
            <div className="claim-topic-grid claim-topic-grid--simple">
              {visibleTopics.map((topic) => {
                const unavailable = !topic.claimTopicUid || topic.available === false;
                const copy = getTopicCopy(topic);
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
                        <strong>{copy.title}</strong>
                        <p>{copy.description}</p>
                        <HelpDetails title={copy.helpTitle}>{copy.help}</HelpDetails>
                        {unavailable ? (
                          <small className="claim-topic-card__unavailable">
                            This check is not available right now. Reload the page or contact an administrator.
                          </small>
                        ) : null}
                      </div>
                    </div>
                    <Toggle
                      checked={topic.enabled}
                      onChange={(enabled) => setTopicEnabled(topic, enabled)}
                      label={topic.enabled ? 'Required' : unavailable ? 'Unavailable' : 'Not required'}
                      description={topic.enabled ? 'Investors must pass this check.' : 'This check will not be required.'}
                      disabled={unavailable || backend.isLocked}
                    />
                    {!unavailable ? (
                      <ImpactNote
                        title={topic.enabled ? 'If you require this' : 'If you leave this off'}
                        tone={topic.enabled ? 'positive' : 'neutral'}
                      >
                        {topic.enabled ? copy.enabledImpact : copy.disabledImpact}
                      </ImpactNote>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="issuance-empty-inline" role="status">
              <BadgeCheck size={18} />
              <span>
                No investor checks are available for this asset. Reload the page or ask an administrator to configure them.
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
            title="Who will approve investors?"
            description="Confirm who is responsible for reviewing investors and approving the checks you selected."
            action={
              organizationActsAsIssuer ? (
                <StatusBadge status="valid">Confirmed</StatusBadge>
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
                <strong>My organization will review and approve investors</strong>
                <small>
                  Your approved organization account will confirm that each investor meets the checks you selected.
                </small>
              </span>
            </label>
            <ImpactNote title="What this means" tone={organizationActsAsIssuer ? 'positive' : 'warning'}>
              {organizationActsAsIssuer
                ? 'Your organization will be the approval authority for this asset. Investors cannot participate until the required checks are approved.'
                : 'You must confirm an approval authority before you can continue.'}
            </ImpactNote>
            {trustedIssuerError ? (
              <p className="issuance-section-error" role="alert">
                {trustedIssuerError}
              </p>
            ) : null}
          </SectionCard>

          <aside className="claims-work-card" aria-label="What happens when an investor wants to participate">
            <span className="claims-work-card__icon">
              <Fingerprint size={20} />
            </span>
            <div>
              <strong>What happens when an investor wants to participate?</strong>
              <ol className="claims-work-card__steps">
                <li><b>1. They complete your required checks.</b><span>The investor provides the information needed for the options you selected.</span></li>
                <li><b>2. The investor is reviewed.</b><span>Your approved process confirms whether the investor is eligible.</span></li>
                <li><b>3. Approved investors can participate.</b><span>Only approved investors can invest in or receive the asset.</span></li>
              </ol>
              <span className="claims-work-card__note">
                <ShieldCheck size={15} /> These checks are automatically enforced when the asset is transferred.
              </span>
              <HelpDetails className="claims-technical-details" title="View technical details">
                Investor eligibility is recorded using verified credentials. The asset rules check those credentials before an investor can participate.
              </HelpDetails>
            </div>
          </aside>
        </div>
      </div>
    </IssuanceLayout>
  );
}
