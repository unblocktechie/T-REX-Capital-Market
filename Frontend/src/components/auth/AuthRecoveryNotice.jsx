import { RefreshCcw } from 'lucide-react';

export function AuthRecoveryNotice({ state }) {
  if (!state?.active || !state?.message) return null;

  return (
    <div
      className="flex items-start gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--primary-500)_22%,transparent)] bg-[color-mix(in_srgb,var(--primary-500)_6%,transparent)] px-3.5 py-3 text-[13px] leading-5 text-[var(--text-soft)]"
      role="status"
      aria-live="polite"
    >
      <RefreshCcw className="mt-0.5 size-[16px] shrink-0 animate-spin text-[var(--primary-600)]" aria-hidden="true" />
      <span>{state.message}</span>
    </div>
  );
}
