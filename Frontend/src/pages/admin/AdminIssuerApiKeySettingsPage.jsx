import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ChevronDown,
  CircleHelp,
  Coins,
  Server,
  Info,
  ArrowRight,
  KeyRound,
  RefreshCcw,
  Save,
  ShieldCheck,
  TimerReset,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminIssuerApiKeySettingsApi } from '@/api/admin';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getErrorMessage } from '@/utils/error';

const QUERY_KEY = ['admin', 'issuer-api-key-settings'];
const MAX_SETTING_VALUE = 1_000_000;

const FIELD_CONFIG = Object.freeze({
  IssuerApiKeyMaxActive: {
    label: 'Maximum active API keys per issuer',
    hint: "The number of working keys one issuer can have at once. Revoked and expired keys don't count.",
    min: 1,
  },
  TokenPriceRelaySignatureTtlSeconds: {
    label: 'Signature valid for (seconds)',
    hint: 'How long a bot has to send a prepared price update before it expires.',
    min: 60,
    suffix: 'seconds',
  },
  TokenPriceRelayRateLimitCount: {
    label: 'Price updates allowed',
    hint: 'Maximum price updates per issuer Service Wallet, on each network.',
    min: 1,
  },
  TokenPriceRelayRateLimitWindowSeconds: {
    label: 'Time window (seconds)',
    reviewLabel: 'Price update time window',
    hint: 'How often this price-update allowance resets.',
    min: 1,
    suffix: 'seconds',
  },
  TokenPriceApiReadRateLimitCount: {
    label: 'Requests allowed',
    hint: 'Maximum price API requests per issuer, shared across all keys and networks.',
    min: 1,
  },
  TokenPriceApiReadRateLimitWindowSeconds: {
    label: 'Time window (seconds)',
    reviewLabel: 'API request time window',
    hint: 'How often this API-request allowance resets.',
    min: 1,
    suffix: 'seconds',
  },
});

const formatDuration = (value) => {
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < 1) return '—';
  if (seconds % 86_400 === 0) return `${seconds / 86_400} ${seconds === 86_400 ? 'day' : 'days'}`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600} ${seconds === 3_600 ? 'hour' : 'hours'}`;
  if (seconds % 60 === 0) return `${seconds / 60} ${seconds === 60 ? 'minute' : 'minutes'}`;
  return `${seconds.toLocaleString()} ${seconds === 1 ? 'second' : 'seconds'}`;
};

function LimitPreview({ count, windowSeconds, unit, scope }) {
  const amount = Number(count);
  const validAmount = String(count).trim() !== '' && Number.isInteger(amount) && amount >= 1 && amount <= MAX_SETTING_VALUE;
  const validWindow = String(windowSeconds).trim() !== '' && Number.isInteger(Number(windowSeconds)) && Number(windowSeconds) >= 1 && Number(windowSeconds) <= MAX_SETTING_VALUE;
  return (
    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-3" aria-live="polite">
      <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-blue-700">With these settings</p>
      <p className="mt-1 mb-0 text-sm font-semibold leading-5 text-slate-900">
        {validAmount && validWindow
          ? `${amount.toLocaleString()} ${unit} every ${formatDuration(windowSeconds)}`
          : 'Enter valid values to see the limit'}
      </p>
      <p className="mt-1 mb-0 text-xs leading-5 text-slate-600">{scope}</p>
    </div>
  );
}

function ImpactGuidance({ higher, lower, tip, children }) {
  return (
    <details className="group mt-4 rounded-xl border border-slate-200 bg-slate-50/70">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-blue-700 marker:hidden hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2"><CircleHelp className="size-4 shrink-0" aria-hidden="true" />Impact &amp; recommendation</span>
        <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-2 border-t border-slate-200 px-3 py-3 text-xs leading-5 text-slate-600">
        <p className="m-0"><strong className="text-emerald-700">Higher:</strong> {higher}</p>
        <p className="m-0"><strong className="text-slate-900">Lower:</strong> {lower}</p>
        {children}
        <p className="m-0"><strong className="text-slate-900">Tip:</strong> {tip}</p>
      </div>
    </details>
  );
}

const EMPTY_FORM = Object.keys(FIELD_CONFIG).reduce((result, key) => {
  result[key] = '';
  return result;
}, {});

const toFormValues = (settings = {}) => Object.keys(FIELD_CONFIG).reduce((result, key) => {
  const value = settings?.[key];
  result[key] = Number.isFinite(Number(value)) ? String(value) : '';
  return result;
}, {});

const sanitizeInteger = (value) => String(value ?? '').replace(/\D/g, '').slice(0, 7);

const validateField = (key, rawValue) => {
  const config = FIELD_CONFIG[key];
  if (!String(rawValue || '').trim()) return 'Enter a value.';
  const value = Number(rawValue);
  if (!Number.isInteger(value)) return 'Use a whole number.';
  if (value < config.min || value > MAX_SETTING_VALUE) {
    return `${config.label} must be between ${config.min.toLocaleString()} and ${MAX_SETTING_VALUE.toLocaleString()}.`;
  }
  return '';
};

function SettingField({ fieldKey, value, onChange, disabled }) {
  const config = FIELD_CONFIG[fieldKey];
  const error = validateField(fieldKey, value);
  return (
    <Input
      label={config.label}
      value={value}
      onChange={(event) => onChange(fieldKey, sanitizeInteger(event.target.value))}
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      disabled={disabled}
      error={error || undefined}
      hint={`${config.hint} Allowed range: ${config.min.toLocaleString()}–${MAX_SETTING_VALUE.toLocaleString()}${config.suffix ? ` ${config.suffix}` : ''}.`}
      trailing={config.suffix ? <span className="shrink-0 text-xs font-semibold text-slate-400">{config.suffix}</span> : undefined}
    />
  );
}

function SettingsSaveReviewModal({ review, onClose, onConfirm, saving }) {
  if (!review) return null;

  const changeCount = review.changes.length;
  return (
    <Modal
      open
      title="Review changes"
      onClose={onClose}
      trapFocus
      dismissible={!saving}
      className="sm:max-w-2xl"
      bodyClassName="px-4 py-4 sm:px-6 sm:py-5"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button icon={Save} onClick={onConfirm} loading={saving} disabled={saving} className="w-full sm:w-auto">
            Confirm &amp; Save
          </Button>
        </>
      }
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="m-0 text-sm font-semibold text-slate-900">
              {changeCount} {changeCount === 1 ? 'setting' : 'settings'} will be updated
            </p>
            <p className="mt-1 mb-0 text-xs leading-5 text-slate-500">Review the changes before saving.</p>
          </div>
          <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {changeCount} {changeCount === 1 ? 'change' : 'changes'}
          </span>
        </div>

        <div className="mt-4 border-t border-slate-200" aria-label="Settings changes to confirm">
          <div className="admin-grid-table-header grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.65fr)_auto_minmax(0,0.8fr)] items-center gap-x-2 px-1 py-2.5 text-[10px] font-semibold tracking-wide text-slate-500 uppercase sm:gap-x-3 sm:px-2">
            <span>Setting</span>
            <span>Current</span>
            <span aria-hidden="true" />
            <span className="text-right">New</span>
          </div>
          <div role="list" aria-label="Previous and new API key settings">
            {review.changes.map(({ key, previousValue, nextValue }) => {
              const setting = FIELD_CONFIG[key];
              // Short units keep all six changes easy to scan in a single-row layout.
              const formatValue = (value) => `${Number(value).toLocaleString()}${setting.suffix ? 's' : ''}`;
              const accessibleValue = (value) => `${Number(value).toLocaleString()}${setting.suffix ? ' seconds' : ''}`;
              return (
                <div
                  key={key}
                  role="listitem"
                  className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.65fr)_auto_minmax(0,0.8fr)] items-center gap-x-2 border-t border-slate-100 px-1 py-2.5 sm:gap-x-3 sm:px-2"
                >
                  <span className="min-w-0 text-xs leading-4 font-medium text-slate-900 sm:text-sm sm:leading-5">
                    {setting.reviewLabel || setting.label}
                  </span>
                  <span title={accessibleValue(previousValue)} className="min-w-0 break-words text-xs tabular-nums text-slate-600 sm:text-sm">
                    {formatValue(previousValue)}
                  </span>
                  <ArrowRight className="size-3 shrink-0 text-slate-400 sm:size-4" aria-label="changes to" />
                  <div className="min-w-0 text-right">
                    <span
                      title={accessibleValue(nextValue)}
                      className="inline-block max-w-full break-all rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold tabular-nums text-blue-700 sm:text-sm"
                    >
                      {formatValue(nextValue)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>Changes take effect immediately after saving.</span>
        </div>
      </div>
    </Modal>
  );
}

export default function AdminIssuerApiKeySettingsPage() {
  useDocumentTitle('Issuer API Settings');
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [baseline, setBaseline] = useState(EMPTY_FORM);
  const [pendingReview, setPendingReview] = useState(null);

  const settingsQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: adminIssuerApiKeySettingsApi.get,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    const next = toFormValues(settingsQuery.data);
    setForm(next);
    setBaseline(next);
  }, [settingsQuery.data]);

  const errors = useMemo(() => Object.keys(FIELD_CONFIG).reduce((result, key) => {
    const error = validateField(key, form[key]);
    if (error) result[key] = error;
    return result;
  }, {}), [form]);

  const changedPayload = useMemo(() => Object.keys(FIELD_CONFIG).reduce((result, key) => {
    if (form[key] !== baseline[key] && !validateField(key, form[key])) {
      result[key] = Number(form[key]);
    }
    return result;
  }, {}), [form, baseline]);

  const hasChanges = Object.keys(changedPayload).length > 0;
  const isValid = Object.keys(errors).length === 0;

  const updateMutation = useMutation({
    mutationFn: adminIssuerApiKeySettingsApi.update,
    onSuccess: (payload, submittedPayload) => {
      // PATCH may return either the full settings object or only the changed fields.
      // Merge it over the submitted form so unspecified settings never disappear locally.
      const mergedSettings = Object.keys(FIELD_CONFIG).reduce((result, key) => {
        const responseValue = payload?.[key];
        result[key] = responseValue ?? submittedPayload[key] ?? Number(baseline[key]);
        return result;
      }, {});
      const next = toFormValues(mergedSettings);
      setForm(next);
      setBaseline(next);
      setPendingReview(null);
      queryClient.setQueryData(QUERY_KEY, mergedSettings);
      toast.success('Issuer API key settings updated', {
        description: 'The new configuration is active immediately. No application restart is required.',
      });
    },
    onError: (error) => {
      toast.error('Could not update issuer API key settings', {
        description: getErrorMessage(error),
      });
    },
  });

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const reset = () => setForm(baseline);
  const save = () => {
    if (!hasChanges || !isValid || updateMutation.isPending || pendingReview) return;
    // Freeze exactly what the administrator reviewed; never recalculate the PATCH after the dialog opens.
    const payload = { ...changedPayload };
    setPendingReview({
      payload,
      changes: Object.keys(payload).map((key) => ({
        key,
        previousValue: Number(baseline[key]),
        nextValue: payload[key],
      })),
    });
  };
  const closeReview = () => {
    if (!updateMutation.isPending) setPendingReview(null);
  };
  const confirmSave = () => {
    if (!pendingReview || updateMutation.isPending) return;
    updateMutation.mutate(pendingReview.payload);
  };

  if (settingsQuery.isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-28 animate-pulse rounded-[24px] border border-slate-200 bg-white" />
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="h-64 animate-pulse rounded-[24px] border border-slate-200 bg-white" />
          <div className="h-64 animate-pulse rounded-[24px] border border-slate-200 bg-white" />
        </div>
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <div className="mx-auto max-w-3xl rounded-[24px] border border-rose-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-lg font-semibold text-slate-950">Could not load API key settings</h2>
            <p className="mt-2 mb-4 text-sm leading-6 text-slate-500">{getErrorMessage(settingsQuery.error)}</p>
            <Button variant="secondary" icon={RefreshCcw} onClick={() => settingsQuery.refetch()}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-blue-600 uppercase">Automation configuration</p>
          <h2 className="m-0 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">Issuer API settings</h2>
          <p className="mt-3 mb-0 max-w-3xl text-sm leading-6 text-slate-500">
            Manage how many API keys issuers can use, how long price requests stay valid, and how often pricing bots can make requests.
          </p>
        </div>
        <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
          <Button variant="secondary" icon={RefreshCcw} onClick={reset} disabled={!hasChanges || updateMutation.isPending} className="w-full sm:w-auto">
            Discard changes
          </Button>
          <Button icon={Save} onClick={save} loading={updateMutation.isPending} disabled={!hasChanges || !isValid} className="w-full sm:w-auto">
            Review changes
          </Button>
        </div>
      </header>

      <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-blue-950">
        <Info className="mt-0.5 size-5 shrink-0 text-blue-600" aria-hidden="true" />
        <div className="min-w-0">
          <strong className="block text-sm font-semibold">Changes apply immediately</strong>
          <p className="mt-1 mb-0 text-xs leading-5 text-blue-800/80">
            After you review and confirm, only the settings you changed will be saved. You do not need to restart the application.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 xl:items-stretch">
        <AdminPanel
          className="min-w-0"
          title={<span className="inline-flex items-center gap-2"><KeyRound className="size-4 shrink-0 text-slate-500" aria-hidden="true" />API keys per issuer</span>}
          description="How many API keys each issuer can have switched on at the same time. Issuers use them for their pricing bots."
        >
          <SettingField fieldKey="IssuerApiKeyMaxActive" value={form.IssuerApiKeyMaxActive} onChange={setField} disabled={updateMutation.isPending} />
          <ImpactGuidance
            higher="Issuers can run more bots or servers, but there are more keys to protect."
            lower="Fewer keys to manage. Issuers above the new limit keep their existing keys, but can't create more until they're below it. Replacing a key still works."
            tip="5 active keys is enough for most issuers, including a live bot, test bot, and backup."
          />
        </AdminPanel>

        <AdminPanel
          className="min-w-0"
          title={<span className="inline-flex items-center gap-2"><TimerReset className="size-4 shrink-0 text-slate-500" aria-hidden="true" />Price signature expiry</span>}
          description="How long an issuer's bot has to sign and send a price after preparing it."
        >
          <SettingField fieldKey="TokenPriceRelaySignatureTtlSeconds" value={form.TokenPriceRelaySignatureTtlSeconds} onChange={setField} disabled={updateMutation.isPending} />
          <p className="mt-3 mb-0 text-xs leading-5 text-slate-600">
            <TimerReset className="mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
            {validateField('TokenPriceRelaySignatureTtlSeconds', form.TokenPriceRelaySignatureTtlSeconds)
              ? 'Enter a valid time to see when the signature expires.'
              : `Expires after ${formatDuration(form.TokenPriceRelaySignatureTtlSeconds)}.`} Existing signed requests keep their original expiry.
          </p>
          <ImpactGuidance
            higher="Slow bots have more time, but an older signed price stays usable for longer."
            lower="Safer for older requests, but slower bots may see more expiry errors."
            tip="600 seconds (10 minutes) is a useful default. Very long expiry times are best avoided."
          />
        </AdminPanel>

        <AdminPanel
          className="min-w-0"
          title={<span className="inline-flex items-center gap-2"><Coins className="size-4 shrink-0 text-slate-500" aria-hidden="true" />Price update limit</span>}
          description="Control how often issuers can send automatic price updates to the blockchain. Each update costs the platform gas fees."
        >
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 md:grid-cols-2">
            <SettingField fieldKey="TokenPriceRelayRateLimitCount" value={form.TokenPriceRelayRateLimitCount} onChange={setField} disabled={updateMutation.isPending} />
            <SettingField fieldKey="TokenPriceRelayRateLimitWindowSeconds" value={form.TokenPriceRelayRateLimitWindowSeconds} onChange={setField} disabled={updateMutation.isPending} />
          </div>
          <LimitPreview
            count={form.TokenPriceRelayRateLimitCount}
            windowSeconds={form.TokenPriceRelayRateLimitWindowSeconds}
            unit="price updates"
            scope="Per issuer Service Wallet, per network."
          />
          <ImpactGuidance
            higher="Prices can be updated more often, but the platform could pay more gas fees."
            lower="Protects the gas budget, but busy bots may have to wait."
            tip="Use lower limits on expensive networks such as Ethereum mainnet."
          >
            <p className="m-0">Each network has its own allowance for a Service Wallet.</p>
          </ImpactGuidance>
        </AdminPanel>

        <AdminPanel
          className="min-w-0"
          title={<span className="inline-flex items-center gap-2"><Server className="size-4 shrink-0 text-slate-500" aria-hidden="true" />API request limit</span>}
          description="Protect the price API from too many requests. These requests don't cost blockchain gas, but they use server resources."
        >
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 md:grid-cols-2">
            <SettingField fieldKey="TokenPriceApiReadRateLimitCount" value={form.TokenPriceApiReadRateLimitCount} onChange={setField} disabled={updateMutation.isPending} />
            <SettingField fieldKey="TokenPriceApiReadRateLimitWindowSeconds" value={form.TokenPriceApiReadRateLimitWindowSeconds} onChange={setField} disabled={updateMutation.isPending} />
          </div>
          <LimitPreview
            count={form.TokenPriceApiReadRateLimitCount}
            windowSeconds={form.TokenPriceApiReadRateLimitWindowSeconds}
            unit="requests"
            scope="Per issuer, shared across all API keys and networks."
          />
          <ImpactGuidance
            higher="Bots can check prices and statuses more often, but that increases server traffic."
            lower="Reduces server load, but bots that check too often may be asked to wait."
            tip="Choose a limit that suits your bots' activity without overloading the API."
          />
        </AdminPanel>
      </div>

      {hasChanges ? (
        <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-[0_16px_50px_rgba(15,23,42,0.15)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-600">
            <Activity className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
            <span>You have unsaved API-key configuration changes.</span>
          </div>
          <Button icon={Save} onClick={save} loading={updateMutation.isPending} disabled={!isValid} className="w-full sm:w-auto">
            Review changes
          </Button>
        </div>
      ) : null}

      <SettingsSaveReviewModal
        review={pendingReview}
        onClose={closeReview}
        onConfirm={confirmSave}
        saving={updateMutation.isPending}
      />
    </div>
  );
}
