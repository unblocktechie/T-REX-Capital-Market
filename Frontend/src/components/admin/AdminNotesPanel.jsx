import { useEffect, useMemo, useState } from 'react';
import { AtSign, Save, Send } from 'lucide-react';
import { formatAdminDateTime } from '@/utils/adminFormat';

export function AdminNotesPanel({ organization, onAddNote, loading }) {
  const storageKey = `trex_admin_note_draft_${organization.id}`;
  const [draft, setDraft] = useState(() => window.localStorage.getItem(storageKey) || '');
  const [savedAt, setSavedAt] = useState(null);
  const mentionActive = useMemo(() => /(^|\s)@[\w-]*$/.test(draft), [draft]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, draft);
      setSavedAt(new Date());
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, storageKey]);

  const submit = async () => {
    if (!draft.trim()) return;
    await onAddNote(draft.trim());
    setDraft('');
    window.localStorage.removeItem(storageKey);
  };

  return (
    <div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} className="w-full resize-none border-0 bg-transparent text-sm leading-6 text-slate-950 outline-none placeholder:text-slate-400 dark:text-white" placeholder="Add an internal note… Use @ to mention another reviewer." aria-label="Internal reviewer note" />
        {mentionActive ? <div className="mb-2 rounded-xl border border-blue-200 bg-white p-2 text-xs text-slate-600 shadow-lg dark:border-blue-500/30 dark:bg-slate-900 dark:text-slate-300"><span className="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400"><AtSign className="size-3.5" />Mention reviewer</span><div className="mt-1 flex flex-wrap gap-1.5">{['Maya Chen','Aisha Patel','Liam Carter'].map((name) => <button type="button" key={name} onClick={() => setDraft((value) => value.replace(/@[\w-]*$/, `@${name.replace(' ', '')} `))} className="rounded-lg bg-slate-100 px-2 py-1 font-semibold dark:bg-slate-800">{name}</button>)}</div></div> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400"><Save className="size-3.5" />{savedAt ? `Draft saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Draft auto-saves'}</span>
          <button type="button" disabled={!draft.trim() || loading} onClick={submit} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-45 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"><Send className="size-3.5" />{loading ? 'Adding…' : 'Add internal note'}</button>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {(organization.notes || []).map((note) => (
          <article key={note.id} className="flex gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{note.initials}</span>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-slate-950 dark:text-white">{note.author}</strong><time className="text-[11px] font-semibold text-slate-400">{formatAdminDateTime(note.createdAt)}</time></div><p className="mt-1 mb-0 text-sm leading-6 text-slate-600 dark:text-slate-300">{note.message}</p></div>
          </article>
        ))}
        {!organization.notes?.length ? <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800">No internal notes yet.</div> : null}
      </div>
    </div>
  );
}
