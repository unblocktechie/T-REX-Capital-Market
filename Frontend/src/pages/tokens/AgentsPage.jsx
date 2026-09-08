import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AddressDisplay,
  FieldWrapper,
  SectionCard,
  StatusBadge,
  TextInput,
} from '@/components/token-issuance/IssuancePrimitives';
import { IssuanceLayout } from '@/components/token-issuance/IssuanceLayout';
import { TOKEN_CREATION_AGENT_ROLES } from '@/config/tokenIssuance';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { useTokenIssuanceStore } from '@/store/tokenIssuance.store';
import { validateAgents } from '@/utils/tokenIssuance';

export default function AgentsPage() {
  const navigate = useNavigate();
  const wallet = useWalletConnection();
  const agents = useTokenIssuanceStore((state) => state.agents);
  const updateAgent = useTokenIssuanceStore((state) => state.updateAgent);
  const hydrateWalletDefaults = useTokenIssuanceStore((state) => state.hydrateWalletDefaults);
  const markStepCompleted = useTokenIssuanceStore((state) => state.markStepCompleted);
  const markStepTouched = useTokenIssuanceStore((state) => state.markStepTouched);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState({});
  const errors = validateAgents(agents);
  useDocumentTitle('Governance Agents');

  useEffect(() => {
    hydrateWalletDefaults(wallet.address);
  }, [hydrateWalletDefaults, wallet.address]);

  const fieldError = (key) => (submitted || touched[key] ? errors[key] : undefined);
  const continueStep = () => {
    setSubmitted(true);
    markStepTouched('agents');
    if (Object.keys(errors).length) return;
    markStepCompleted('agents');
    navigate(ROUTES.tokenIssuanceStep('review'));
  };

  const isConnectedWallet = (address) =>
    Boolean(
      wallet.address &&
        address &&
        wallet.address.toLowerCase() === address.toLowerCase(),
    );

  return (
    <IssuanceLayout
      stepKey="agents"
      title="Governance Agents"
      description="Assign the two operational wallets required by this token-creation flow."
      onBack={() => navigate(ROUTES.tokenIssuanceStep('compliance'))}
      onContinue={continueStep}
      continueLabel="Continue to Review"
      continueIcon={ArrowRight}
    >
      <div className="agent-card-list agent-card-list--two">
        {TOKEN_CREATION_AGENT_ROLES.map((role) => {
          const agent = agents[role.key];
          const autoAssigned = isConnectedWallet(agent?.address);

          return (
            <SectionCard
              key={role.key}
              className="agent-role-card"
              title={role.name}
              description={role.description}
              action={
                <div className="agent-role-badges">
                  <StatusBadge status="neutral">Required</StatusBadge>
                  {autoAssigned ? <StatusBadge status="valid">Auto-assigned</StatusBadge> : null}
                </div>
              }
            >
              <div className="agent-role-form">
                <FieldWrapper
                  label={`${role.name} Wallet Address`}
                  required
                  error={fieldError(role.key)}
                  hint="The connected issuer wallet is prefilled when available."
                  htmlFor={`agent-${role.key}`}
                >
                  <TextInput
                    id={`agent-${role.key}`}
                    value={agent?.address || ''}
                    onChange={(event) =>
                      updateAgent(role.key, {
                        address: event.target.value.trim(),
                        autoAssigned: false,
                      })
                    }
                    onBlur={() =>
                      setTouched((current) => ({ ...current, [role.key]: true }))
                    }
                    placeholder="0x…"
                    spellCheck="false"
                    error={fieldError(role.key)}
                  />
                </FieldWrapper>
                <AddressDisplay address={agent?.address} label="Assigned wallet" compact />
              </div>

              <div className="agent-permission-summary">
                <h3>
                  <ShieldCheck size={17} /> Permission summary
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

      <SectionCard
        title="Role Permission Matrix"
        description="Review the responsibility assigned to each governance wallet."
      >
        <div className="agent-permission-table-wrap">
          <table className="agent-permission-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Primary permissions</th>
                <th>Transfer verification responsibility</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Token Agent</th>
                <td>Mint, burn, pause, unpause, freeze and unfreeze</td>
                <td>Applies approved token-level controls</td>
              </tr>
              <tr>
                <th>Identity Manager</th>
                <td>Add, remove and update verified investor identities</td>
                <td>Maintains the identity eligibility checked before transfers</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>
    </IssuanceLayout>
  );
}
