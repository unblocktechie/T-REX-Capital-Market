import { ArrowRight, CheckCircle2, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { tokenApi } from '@/api/tokens';
import { toGovernancePayload } from '@/api/tokens/token.mapper';
import {
  AddressDisplay,
  SectionCard,
  StatusBadge,
} from '@/components/token-issuance/IssuancePrimitives';
import { IssuanceLayout } from '@/components/token-issuance/IssuanceLayout';
import { TOKEN_CREATION_AGENT_ROLES } from '@/config/tokenIssuance';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOrganization } from '@/hooks/useOrganization';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { mapTokenApiFieldErrors, getTokenApiErrorMessage } from '@/utils/tokenApiValidation';
import { validateAgents } from '@/utils/tokenIssuance';

const ROLE_ICONS = {
  tokenAgent: KeyRound,
  identityRegistryAgent: ShieldCheck,
};

const GOVERNANCE_FIELD_MAP = {
  tokenAgentWalletAddress: 'tokenAgent',
  identityManagerWalletAddress: 'identityRegistryAgent',
};

export default function AgentsPage() {
  const navigate = useNavigate();
  const { organization, isLoading: organizationLoading } = useOrganization();
  const agents = useTokenIssuanceStore((state) => state.agents);
  const backend = useTokenIssuanceStore((state) => state.backend);
  const updateAgent = useTokenIssuanceStore((state) => state.updateAgent);
  const hydrateWalletDefaults = useTokenIssuanceStore((state) => state.hydrateWalletDefaults);
  const markStepCompleted = useTokenIssuanceStore((state) => state.markStepCompleted);
  const markStepTouched = useTokenIssuanceStore((state) => state.markStepTouched);
  const recordBackendSave = useTokenIssuanceStore((state) => state.recordBackendSave);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const organizationWallet = organization?.walletAddress || '';
  const errors = validateAgents(agents, organizationWallet);
  useDocumentTitle('Governance Agents');

  useEffect(() => {
    hydrateWalletDefaults(organizationWallet);
  }, [hydrateWalletDefaults, organizationWallet]);

  useEffect(() => {
    if (!organizationWallet || backend.isLocked) return;
    TOKEN_CREATION_AGENT_ROLES.forEach((role) => {
      if (agents[role.key]?.address !== organizationWallet) {
        updateAgent(role.key, { address: organizationWallet, autoAssigned: true });
      }
    });
  }, [agents, backend.isLocked, organizationWallet, updateAgent]);

  const continueStep = async () => {
    if (saving || backend.isLocked) return;
    setSubmitted(true);
    setServerErrors({});
    markStepTouched('agents');
    if (Object.keys(errors).length) return;

    setSaving(true);
    try {
      const response = await tokenApi.saveGovernance(toGovernancePayload(agents, false));
      recordBackendSave('agents', response);
      markStepCompleted('agents');
      toast.success('Governance roles saved securely.');
      navigate(ROUTES.tokenIssuanceStep('review'));
    } catch (error) {
      setServerErrors(mapTokenApiFieldErrors(error, GOVERNANCE_FIELD_MAP));
      toast.error('Governance roles were not saved.', {
        description: getTokenApiErrorMessage(
          error,
          'Confirm the approved organization wallet and try again.',
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  const isOrganizationWallet = (address) =>
    Boolean(
      organizationWallet &&
        address &&
        organizationWallet.toLowerCase() === address.toLowerCase(),
    );

  return (
    <IssuanceLayout
      stepKey="agents"
      title="Governance Agents"
      description="Review the operational wallets automatically assigned to manage this token."
      onBack={() => navigate(ROUTES.tokenIssuanceStep('compliance'))}
      onContinue={continueStep}
      continueLabel="Save and Continue to Review"
      continueIcon={ArrowRight}
      continueLoading={saving}
      continueDisabled={organizationLoading || !organizationWallet}
      stepErrors={{ agents: submitted ? { ...errors, ...serverErrors } : undefined }}
    >
      <div className="agent-readonly-notice" role="note">
        <span className="agent-readonly-notice__icon" aria-hidden="true">
          <Lock size={18} />
        </span>
        <div className="agent-readonly-notice__content">
          <strong>Governance wallets use the approved organization wallet</strong>
          <p>
            For security, use the same wallet that was registered during organization
            onboarding. These addresses are read-only during token creation.
          </p>
        </div>
        <StatusBadge status="valid">Read only</StatusBadge>
      </div>

      <div className="agent-card-list agent-card-list--two">
        {TOKEN_CREATION_AGENT_ROLES.map((role) => {
          const agent = agents[role.key];
          const autoAssigned = isOrganizationWallet(agent?.address);
          const RoleIcon = ROLE_ICONS[role.key] || ShieldCheck;
          const error = serverErrors[role.key] || (submitted ? errors[role.key] : undefined);

          return (
            <SectionCard key={role.key} className="agent-role-card agent-role-card--readonly">
              <div className="agent-role-heading">
                <span className="agent-role-heading__icon" aria-hidden="true">
                  <RoleIcon size={21} />
                </span>
                <div className="agent-role-heading__content">
                  <div className="agent-role-heading__title-row">
                    <h2>{role.name}</h2>
                    <div className="agent-role-badges">
                      <StatusBadge status="neutral">Required</StatusBadge>
                      <StatusBadge status={autoAssigned ? 'valid' : 'warning'}>
                        {autoAssigned ? 'Organization assigned' : 'Assignment pending'}
                      </StatusBadge>
                    </div>
                  </div>
                  <p>{role.description}</p>
                </div>
              </div>

              <div className="agent-readonly-wallet">
                <div className="agent-readonly-wallet__label-row">
                  <span>{role.name} Wallet Address</span>
                  <span className="agent-readonly-wallet__locked">
                    <Lock size={12} /> Not editable
                  </span>
                </div>
                <AddressDisplay
                  address={agent?.address}
                  label="Approved organization wallet"
                  emptyLabel="Wallet assignment pending"
                  showFullAddress
                  className={error ? 'agent-readonly-address agent-readonly-address--error' : 'agent-readonly-address'}
                />
                {error ? (
                  <p className="agent-readonly-wallet__error" role="alert">
                    {error}
                  </p>
                ) : (
                  <p className="agent-readonly-wallet__hint">
                    This wallet will receive the permissions listed below after deployment.
                  </p>
                )}
              </div>

              <div className="agent-permission-summary agent-permission-summary--readonly">
                <h3>
                  <ShieldCheck size={17} /> Assigned permissions
                </h3>
                <ul>
                  {role.permissions.map((permission) => (
                    <li key={permission}>
                      <CheckCircle2 size={15} /> {permission}
                    </li>
                  ))}
                </ul>
              </div>
            </SectionCard>
          );
        })}
      </div>
    </IssuanceLayout>
  );
}
