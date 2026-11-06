import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  Clock3,
  Copy,
  Download,
  KeyRound,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { organizationApi } from '@/api/organization';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { BotIpAllowlistInput } from './BotIpAllowlistInput';
import { Modal } from '@/components/ui/Modal';
import { getErrorMessage } from '@/utils/error';
import { isKeyActive, normalizePolicyOptions, validateAllowedIps, splitIps } from '@/utils/botPolicy';

const API_KEYS_QUERY_KEY = ['organization', 'api-keys'];

const text = (...values) => String(values.find((value) => value !== undefined && value !== null) || '').trim();
const rowsOf = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.apiKeys)) return payload.apiKeys;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.keys)) return payload.keys;
  return [];
};

const capacityOf = (payload, fallbackActiveCount = 0) => {
  const meta = payload?.meta || {};
  const activeKeyCount = Number(meta.activeKeyCount);
  const maxActiveKeys = Number(meta.maxActiveKeys);
  const remainingSlots = Number(meta.remainingSlots);

  return {
    activeKeyCount: Number.isFinite(activeKeyCount) && activeKeyCount >= 0
      ? activeKeyCount
      : fallbackActiveCount,
    maxActiveKeys: Number.isFinite(maxActiveKeys) && maxActiveKeys > 0
      ? maxActiveKeys
      : null,
    remainingSlots: Number.isFinite(remainingSlots) && remainingSlots >= 0
      ? remainingSlots
      : null,
  };
};

const normalizeKey = (row = {}) => ({
  uid: text(row.issuerApiKeyUid, row.apiKeyUid, row.uid, row.id),
  name: text(row.name, row.label, 'Issuer API key'),
  maskedValue: text(row.maskedValue, row.maskedApiKey, row.maskedKey, row.keyPreview, row.preview, '••••••••'),
  scopes: Array.isArray(row.scopes) ? row.scopes.filter(Boolean).map(String) : [],
  expiresAt: text(row.expiresAt, row.expiryAt, row.expiresOn),
  lastUsedAt: text(row.lastUsedAt, row.lastUsedOn),
  createdAt: text(row.createdAt),
  revokedAt: text(row.revokedAt),
  revoked: Boolean(row.revokedAt || row.isRevoked || String(row.status || '').toUpperCase() === 'REVOKED'),
  isActive: isKeyActive(row),
  policy: row.policy || null,
});

const formatDateTime = (value, fallback = 'Never') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const secretOf = (payload) => text(payload?.apiKey, payload?.key, payload?.plaintextApiKey, payload?.secret);
const recordOf = (payload) => payload?.apiKeyRecord || payload?.record || payload?.keyMetadata || payload;

function ApiKeyFormModal({ open, mode, current, loading, onClose, onSubmit, policyOptionsQuery, onUnsavedChange }) {
  const bounds = normalizePolicyOptions(policyOptionsQuery?.data);
  const [allowedIps, setAllowedIps] = useState('');
  const [pendingIp, setPendingIp] = useState('');
  const [name, setName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('365');
  const [error, setError] = useState('');

  useEffect(() => {
    onUnsavedChange?.(Boolean(open && (name.trim() || allowedIps || pendingIp || expiresInDays !== '365')));
  }, [open, name, allowedIps, pendingIp, expiresInDays, onUnsavedChange]);

  const closeAndReset = () => {
    if (loading) return;
    setName('');
    setExpiresInDays('365');
    setAllowedIps('');
    setPendingIp('');
    setError('');
    onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    const finalName = name.trim() || (mode === 'rotate' ? `${current?.name || 'Issuer API key'} v2` : 'Production pricing bot');
    const days = Number(expiresInDays);
    if (!Number.isSafeInteger(days) || days < 1 || days > 365) {
      setError('Enter a whole number from 1 to 365 days.');
      return;
    }
    if (mode !== 'rotate') {
      if (!policyOptionsQuery?.isSuccess || !bounds.valid) {
        setError('Policy limits are unavailable. Retry after they load.');
        return;
      }
      if (pendingIp) { setError('Click Add address to include the typed IP before creating the key.'); return; }
      const ipError = validateAllowedIps(allowedIps, bounds);
      if (ipError) { setError(ipError); return; }
    }
    setError('');
    const successful = await onSubmit(mode === 'rotate'
      ? { name: finalName, expiresInDays: days }
      : { name: finalName, expiresInDays: days, allowedIps: splitIps(allowedIps) });
    if (!successful) return;
    setName('');
    setExpiresInDays('365');
    setAllowedIps('');
  };

  return (
    <Modal
      open={open}
      onClose={closeAndReset}
      title={mode === 'rotate' ? 'Replace API key' : 'Create API key'}
      trapFocus
      footer={(
        <>
          <Button variant="secondary" onClick={closeAndReset} disabled={loading}>Cancel</Button>
          <Button type="submit" form="issuer-api-key-form" loading={loading} disabled={loading}>
            {mode === 'rotate' ? 'Replace key' : 'Create key'}
          </Button>
        </>
      )}
    >
      <form id="issuer-api-key-form" className="issuer-api-key-form" onSubmit={submit}>
        {mode === 'rotate' ? (
          <div className="issuer-api-key-warning" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <strong>Replacing this key disables the current key immediately.</strong>
              <span>The replacement key will be shown only once. Update your server before it sends another automated request.</span>
            </div>
          </div>
        ) : (
          <div className="issuer-api-key-note">
            <ShieldCheck size={18} aria-hidden="true" />
            <div>
              <strong>This key is for a trusted server or pricing bot.</strong>
              <span>Do not put it in browser code or browser storage. You will see the full key only once after creation.</span>
            </div>
          </div>
        )}
        <Input
          label="Key name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={mode === 'rotate' ? `${current?.name || 'Production pricing bot'} v2` : 'Production pricing bot'}
          autoComplete="off"
          maxLength={100}
          hint="Use a clear name such as “Production pricing bot” so you can identify this integration later."
        />
        <div className="bot-config__expiry-presets" role="group" aria-label="Common API key expiration periods">
          {[{ days: '30', label: '30 days' }, { days: '90', label: '90 days' }, { days: '365', label: '1 year' }].map(({ days, label }) => (
            <button type="button" key={days} className={expiresInDays === days ? 'is-selected' : ''}
              aria-pressed={expiresInDays === days} onClick={() => { setExpiresInDays(days); setError(''); }}>
              {label}
            </button>
          ))}
          <span>Or enter a custom duration below</span>
        </div>
        <Input
          label="Expires in (days)"
          value={expiresInDays}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '').slice(0, 3);
            if (!digits) {
              setExpiresInDays('');
              setError('');
              return;
            }

            const days = Number(digits);
            if (days < 1) {
              setExpiresInDays('1');
              setError('Minimum expiry is 1 day.');
              return;
            }
            if (days > 365) {
              setExpiresInDays('365');
              setError('Maximum expiry is 365 days.');
              return;
            }

            setExpiresInDays(String(days));
            setError('');
          }}
          inputMode="numeric"
          autoComplete="off"
          maxLength={3}
          pattern="[0-9]*"
          error={error}
          hint="Enter a whole number from 1 to 365 days. The key will expire after this many days."
        />
        {mode !== 'rotate' ? (
          <div className="bot-config__field">
            <BotIpAllowlistInput key={open ? 'create-open' : 'create-closed'} id="new-key-public-ips" compact bounds={bounds} value={allowedIps}
              onPendingChange={setPendingIp}
              onChange={(next) => { setAllowedIps(next); setError(''); }} disabled={loading} />
          </div>
        ) : <p className="bot-config__hint">The replacement key inherits the current key’s saved policy, including its IP allowlist.</p>}
        {mode !== 'rotate' && policyOptionsQuery?.isError && <p role="alert">Unable to load policy limits. You cannot create a usable key until they are available.</p>}
      </form>
    </Modal>
  );
}

function ApiKeySecretModal({ secret, name, action, onDone }) {
  const [confirmed, setConfirmed] = useState(false);

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success('API key copied');
    } catch {
      toast.error('Unable to copy API key');
    }
  };

  const downloadSecret = () => {
    const blob = new Blob([
      `T-REX issuer API key\n\nName: ${name}\nAPI key: ${secret}\n\nStore this file securely. This key cannot be retrieved again from the platform.\n`,
    ], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name || 'issuer-api-key'}.txt`.replace(/[^a-z0-9._-]+/gi, '-').toLowerCase();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      open={Boolean(secret)}
      onClose={() => {}}
      dismissible={false}
      trapFocus
      title={action === 'rotate' ? 'Save your new API key' : 'Save your API key'}
      footer={(
        <Button onClick={onDone} disabled={!confirmed}>I have stored this key</Button>
      )}
    >
      <div className="issuer-api-key-secret">
        <div className="issuer-api-key-secret__warning" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <div>
            <strong>Save this API key now — you will not see it again.</strong>
            <span>Copy or download the key, then store it in your server-side secret manager before closing this window.</span>
          </div>
        </div>
        <div className="issuer-api-key-secret__value" aria-label="New issuer API key">
          <code>{secret}</code>
          <div>
            <Button variant="secondary" size="sm" icon={Copy} onClick={copySecret}>Copy</Button>
            <Button variant="secondary" size="sm" icon={Download} onClick={downloadSecret}>Download</Button>
          </div>
        </div>
        <label className="issuer-api-key-secret__confirm">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>I have stored this API key in a secure server-side secret manager.</span>
        </label>
      </div>
    </Modal>
  );
}

function RevokeApiKeyModal({ open, item, loading, onClose, onConfirm }) {
  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title="Disable issuer API key"
      trapFocus
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="danger" loading={loading} disabled={loading} onClick={onConfirm}>Disable key</Button>
        </>
      )}
    >
      <div className="issuer-api-key-warning" role="alert">
        <AlertTriangle size={19} aria-hidden="true" />
        <div>
          <strong>Disabling this key stops it immediately.</strong>
          <span>{item?.name || 'This key'} will no longer authenticate API requests. If that system needs access again, create a new key.</span>
        </div>
      </div>
    </Modal>
  );
}

export function IssuerApiKeysCard({ policyOptionsQuery, onUnsavedChange }) {
  const queryClient = useQueryClient();
  const [formMode, setFormMode] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const [secretState, setSecretState] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);

  const query = useQuery({
    queryKey: API_KEYS_QUERY_KEY,
    queryFn: organizationApi.listApiKeys,
    staleTime: 15_000,
  });

  const keys = useMemo(() => rowsOf(query.data).map(normalizeKey).filter((item) => item.uid), [query.data]);
  const activeKeys = keys.filter((item) => item.isActive);
  const capacity = capacityOf(query.data, activeKeys.length);
  const activeKeySummary = capacity.maxActiveKeys
    ? `${capacity.activeKeyCount} of ${capacity.maxActiveKeys} active ${capacity.maxActiveKeys === 1 ? 'key' : 'keys'}`
    : `${capacity.activeKeyCount} active API ${capacity.activeKeyCount === 1 ? 'key' : 'keys'}`;
  const activeKeyLimitReached = capacity.remainingSlots === 0
    || (capacity.maxActiveKeys !== null && capacity.activeKeyCount >= capacity.maxActiveKeys);
  const activeKeyLimitMessage = capacity.maxActiveKeys
    ? `Maximum ${capacity.maxActiveKeys} active ${capacity.maxActiveKeys === 1 ? 'key' : 'keys'} reached. Disable an existing key to create another.`
    : 'The active API key limit has been reached. Disable an existing key to create another.';

  const openCreateApiKey = () => {
    if (activeKeyLimitReached || !policyOptionsQuery?.isSuccess || !normalizePolicyOptions(policyOptionsQuery?.data).valid) return;
    setSelectedKey(null);
    setFormMode('create');
  };

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
  };

  const submitKey = async (payload) => {
    setSubmitting(true);
    try {
      const response = formMode === 'rotate'
        ? await organizationApi.rotateApiKey(selectedKey.uid, payload)
        : await organizationApi.createApiKey(payload);
      const secret = secretOf(response);
      if (!secret) throw new Error('The API key was created but its one-time value was not returned. Contact support before retrying.');
      const record = recordOf(response);
      setSecretState({
        secret,
        name: text(record?.name, payload.name),
        action: formMode || 'create',
      });
      setFormMode('');
      setSelectedKey(null);
      // Never conceal a newly issued one-time secret because a subsequent list refetch failed.
      try { await refresh(); } catch { /* the secret modal remains available */ }
      return true;
    } catch (error) {
      toast.error(formMode === 'rotate' ? 'API key was not replaced' : 'API key was not created', {
        description: getErrorMessage(error, 'Please try again.'),
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async () => {
    if (!revokeTarget?.uid) return;
    setSubmitting(true);
    try {
      await organizationApi.revokeApiKey(revokeTarget.uid);
      toast.success('API key disabled');
      setRevokeTarget(null);
      await refresh();
    } catch (error) {
      toast.error('API key was not disabled', { description: getErrorMessage(error, 'Please try again.') });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card className="issuer-api-keys-card">
        <header className="issuer-api-keys-card__header">
          <div className="issuer-api-keys-card__title">
            <span className="issuer-api-keys-card__icon" aria-hidden="true"><KeyRound size={21} /></span>
            <div>
              <span className="eyebrow">Your backend credentials</span>
              <h2>Issuer API Keys</h2>
              <p>Create a separate API key for each trusted server or pricing bot that sends automated issuer requests. Give every key a clear name so you can identify and disable it later.</p>
            </div>
          </div>
          <div className="issuer-api-keys-card__create-action">
            <Button
              icon={Plus}
              onClick={openCreateApiKey}
              disabled={activeKeyLimitReached || !policyOptionsQuery?.isSuccess || !normalizePolicyOptions(policyOptionsQuery?.data).valid}
              aria-describedby={activeKeyLimitReached ? 'issuer-api-key-limit-message' : undefined}
            >
              Create API key
            </Button>
            {activeKeyLimitReached ? (
              <span id="issuer-api-key-limit-message" className="issuer-api-keys-card__limit-message" role="status">
                {activeKeyLimitMessage}
              </span>
            ) : null}
          </div>
        </header>

        <div className="issuer-api-keys-card__security">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>Important: the full API key is shown only once after creation or replacement. Save it in a secure server-side secret manager. After that, this page shows only the masked key and its status.</span>
        </div>

        {query.isPending ? (
          <div className="issuer-api-keys-card__state">Loading API keys…</div>
        ) : query.isError ? (
          <div className="issuer-api-keys-card__state issuer-api-keys-card__state--error">
            <span>API keys could not be loaded.</span>
            <Button variant="secondary" size="sm" icon={RefreshCcw} onClick={() => query.refetch()}>Try again</Button>
          </div>
        ) : !keys.length ? (
          <div className="issuer-api-keys-card__empty">
            <KeyRound size={23} aria-hidden="true" />
            <div>
              <strong>No API keys created yet</strong>
              <span>When your backend or pricing bot is ready, create your first key. You will copy it once and store it securely on the server.</span>
            </div>
          </div>
        ) : (
          <div className="issuer-api-key-list" aria-label="Issuer API keys">
            {keys.map((item) => (
              <article className={`issuer-api-key-row${item.revoked ? ' is-revoked' : ''}`} key={item.uid}>
                <div className="issuer-api-key-row__primary">
                  <div className="issuer-api-key-row__name-line">
                    <strong>{item.name}</strong>
                    <span className={`issuer-api-key-status${item.revoked ? ' is-revoked' : ''}`}>
                      {item.revoked ? 'Disabled' : item.isActive ? 'Active' : 'Expired'}
                    </span>
                  </div>
                  <code>{item.maskedValue}</code>
                </div>
                <div className="issuer-api-key-row__meta">
                  <span><Clock3 size={14} /> Expires: {formatDateTime(item.expiresAt, 'No expiry')}</span>
                  <span><Check size={14} /> Last used: {formatDateTime(item.lastUsedAt)}</span>
                </div>
                <div className="issuer-api-key-row__actions">
                  {!item.revoked ? (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={RefreshCcw}
                        disabled={!item.policy?.allowedIps?.length}
                        title={!item.policy?.allowedIps?.length ? 'Configure an IP allowlist before replacing a legacy key' : undefined}
                        onClick={() => { setSelectedKey(item); setFormMode('rotate'); }}
                      >
                        Replace key
                      </Button>
                      <Button variant="danger" size="sm" icon={Trash2} onClick={() => setRevokeTarget(item)}>
                        Disable key
                      </Button>
                    </>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}

        <footer className="issuer-api-keys-card__footer">
          <span className="issuer-api-keys-card__capacity">
            <strong>{activeKeySummary}</strong>
          </span>
          <span>API keys authenticate your backend. Service Wallet authorization is managed independently on-chain.</span>
        </footer>
      </Card>

      <ApiKeyFormModal onUnsavedChange={onUnsavedChange}
        open={Boolean(formMode)}
        mode={formMode}
        current={selectedKey}
        loading={submitting}
        onClose={() => { setFormMode(''); setSelectedKey(null); }}
        onSubmit={submitKey}
        policyOptionsQuery={policyOptionsQuery}
      />
      <ApiKeySecretModal
        secret={secretState?.secret || ''}
        name={secretState?.name || ''}
        action={secretState?.action || ''}
        onDone={() => setSecretState(null)}
      />
      <RevokeApiKeyModal
        open={Boolean(revokeTarget)}
        item={revokeTarget}
        loading={submitting}
        onClose={() => setRevokeTarget(null)}
        onConfirm={revoke}
      />
    </>
  );
}
