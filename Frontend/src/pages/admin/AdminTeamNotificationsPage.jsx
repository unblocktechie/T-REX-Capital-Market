import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Info, Mail, Save } from 'lucide-react';
import { toast } from 'sonner';
import { adminMonitoringApi } from '@/api/admin';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { AdminListIntro } from '@/components/admin/AdminMonitoringParts';
import { Button } from '@/components/ui/Button';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getErrorMessage } from '@/utils/error';

const KEY = ['admin', 'team-notification-settings'];
const MAX_RECIPIENTS = 20;
const ADDRESS = /^[^\s@,;]+@[^\s@,;.]+(?:\.[^\s@,;.]+)+$/;
export const parseTeamEmails = (text) => {
  const emails = String(text || '').split(/[\n,;]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const unique = [...new Set(emails)];
  return {
    emails: unique,
    duplicates: emails.length - unique.length,
    invalid: unique.filter((email) => !ADDRESS.test(email)),
    tooMany: unique.length > MAX_RECIPIENTS,
  };
};

export default function AdminTeamNotificationsPage() {
  useDocumentTitle('Team notifications');
  const client = useQueryClient();
  const [text, setText] = useState('');
  const [original, setOriginal] = useState([]);
  const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: KEY, queryFn: adminMonitoringApi.getNotificationSettings, staleTime: 30_000 });
  useEffect(() => {
    if (!query.data || editing) return;
    const addresses = Array.isArray(query.data.teamNotificationEmails) ? query.data.teamNotificationEmails : [];
    const normalized = [...new Set(addresses.map((a) => String(a).trim().toLowerCase()))];
    setOriginal(normalized);
    setText(normalized.join('\n'));
  }, [query.data, editing]);
  const parsed = useMemo(() => parseTeamEmails(text), [text]);
  const changed = parsed.emails.join('\n') !== original.join('\n');
  const valid = !parsed.invalid.length && !parsed.tooMany;
  const save = useMutation({
    mutationFn: () => adminMonitoringApi.updateNotificationSettings(parsed.emails),
    onSuccess: (result) => {
      const addresses = Array.isArray(result?.teamNotificationEmails) ? result.teamNotificationEmails : parsed.emails;
      const normalized = [...new Set(addresses.map((a) => String(a).trim().toLowerCase()))];
      setOriginal(normalized); setText(normalized.join('\n')); setEditing(false);
      client.setQueryData(KEY, { ...(query.data || {}), ...result, teamNotificationEmails: normalized });
      toast.success(normalized.length ? 'Team notification recipients saved' : 'Team notifications paused', {
        description: normalized.length ? 'New verification emails will be sent to the saved recipients.' : 'Queued notices will resume when recipients are added again.',
      });
    },
    onError: (error) => toast.error('Could not save notification emails', { description: getErrorMessage(error) }),
  });
  const updateText = (next) => { setText(next); setEditing(true); };
  const discard = () => { setText(original.join('\n')); setEditing(false); };
  return <div className="space-y-6">
    <AdminListIntro eyebrow="Team communication" title="Verification notifications" description="Choose the team members who receive an email when an issuer or investor verifies their email address for the first time."/>
    <AdminPanel title="Team email recipients" description="Add up to 20 unique addresses. One email per line, or separate them with commas. Addresses are saved in lowercase.">
      {query.isLoading ? <div aria-busy="true" className="h-44 animate-pulse rounded-2xl bg-slate-100" /> : query.isError ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Could not load team email settings: {getErrorMessage(query.error)} <button type="button" className="underline" onClick={() => query.refetch()}>Try again</button></div> : <div className="space-y-4">
        <label htmlFor="team-notification-emails" className="block text-sm font-semibold text-slate-900">Email addresses</label>
        <textarea id="team-notification-emails" rows={6} value={text} onChange={(e) => updateText(e.target.value)} spellCheck={false} autoComplete="off" placeholder="team@example.com\noperations@example.com" aria-invalid={!valid} aria-describedby="email-setting-hint" className="w-full min-w-0 rounded-xl border border-slate-200 bg-white p-3 font-mono text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500" id="email-setting-hint"><span>{parsed.emails.length} of {MAX_RECIPIENTS} recipients · {parsed.duplicates ? `${parsed.duplicates} duplicate(s) ignored` : 'Unique addresses only'}</span><span>Only admin users can manage these settings.</span></div>
        {parsed.invalid.length ? <p role="alert" className="m-0 text-sm text-rose-700">Check the following email addresses: {parsed.invalid.join(', ')}</p> : null}
        {parsed.tooMany ? <p role="alert" className="m-0 text-sm text-rose-700">You can save a maximum of {MAX_RECIPIENTS} recipients.</p> : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={discard} disabled={!editing || save.isPending} className="w-full sm:w-auto">Discard changes</Button>
          <Button variant="secondary" onClick={() => updateText('')} disabled={save.isPending || !text.trim()} className="w-full sm:w-auto">Clear recipients</Button>
          <Button icon={Save} onClick={() => save.mutate()} disabled={!changed || !valid || save.isPending} loading={save.isPending} className="w-full sm:w-auto">{parsed.emails.length ? 'Save recipients' : 'Save and pause emails'}</Button>
        </div>
      </div>}
    </AdminPanel>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4"><Mail className="mt-0.5 size-5 shrink-0 text-blue-700"/><div><h3 className="m-0 text-sm font-semibold text-slate-900">When is a notice sent?</h3><p className="mt-1 mb-0 text-xs leading-6 text-slate-600">Only after successful first-time email verification for issuers or investors. Signup, login, resend links and administrator verification do not trigger these notices.</p></div></div>
      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4"><Bell className="mt-0.5 size-5 shrink-0 text-slate-600"/><div><h3 className="m-0 text-sm font-semibold text-slate-900">Queued delivery</h3><p className="mt-1 mb-0 text-xs leading-6 text-slate-600">Clearing recipients pauses sending, not the queue. The backend resumes queued notices when recipients return and retries temporary mail failures automatically.</p></div></div>
    </div>
    <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><Info className="mt-0.5 size-4 shrink-0"/>These settings change email recipients only. No verification status or historical user record is changed. Delivery is handled by the backend.</p>
  </div>;
}
