import { Check, Download, Eye, FileSpreadsheet, FileText, Search, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatAdminDate, formatFileSize } from '@/utils/adminFormat';
import { cn } from '@/utils/cn';

const previewTones = {
  blue: 'from-blue-500/20 to-cyan-500/10 text-blue-700 dark:text-blue-300',
  violet: 'from-violet-500/20 to-fuchsia-500/10 text-violet-700 dark:text-violet-300',
  emerald: 'from-emerald-500/20 to-teal-500/10 text-emerald-700 dark:text-emerald-300',
  amber: 'from-amber-500/20 to-orange-500/10 text-amber-700 dark:text-amber-300',
  cyan: 'from-cyan-500/20 to-sky-500/10 text-cyan-700 dark:text-cyan-300',
};

export function AdminDocumentCard({ document, onApprove, onReject, onPreview, onDownload, loading }) {
  const Icon = document.type === 'XLSX' ? FileSpreadsheet : FileText;
  return (
    <motion.article whileHover={{ y: -3 }} className="group overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-none">
      <div className={cn('relative flex h-32 items-center justify-center overflow-hidden bg-gradient-to-br', previewTones[document.previewTone] || previewTones.blue)}>
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] [background-size:16px_16px]" />
        <Icon className="relative size-12" strokeWidth={1.5} />
        <span className={cn('absolute top-3 right-3 rounded-full border px-2 py-1 text-[10px] font-semibold', document.status === 'verified' ? 'border-emerald-200 bg-white/90 text-emerald-700' : document.status === 'rejected' ? 'border-rose-200 bg-white/90 text-rose-700' : 'border-amber-200 bg-white/90 text-amber-700')}>{document.status}</span>
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-950/55 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          <button type="button" onClick={() => onPreview(document)} className="grid size-10 place-items-center rounded-xl bg-white text-slate-950" aria-label={`Preview ${document.name}`} title="View"><Eye className="size-4" /></button>
          <button type="button" onClick={() => onPreview(document)} className="grid size-10 place-items-center rounded-xl bg-white text-slate-950" aria-label={`Zoom ${document.name}`} title="Zoom"><Search className="size-4" /></button>
          <button type="button" onClick={() => onDownload(document)} className="grid size-10 place-items-center rounded-xl bg-white text-slate-950" aria-label={`Download ${document.name}`} title="Download"><Download className="size-4" /></button>
        </div>
      </div>
      <div className="p-4">
        <h3 className="m-0 truncate text-sm font-semibold text-slate-950 dark:text-white">{document.name}</h3>
        <p className="mt-1 mb-0 truncate text-xs text-slate-500">{document.fileName}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-400"><span>{document.type}</span><span>•</span><span>{formatFileSize(document.size)}</span><span>•</span><span>{formatAdminDate(document.uploadedAt, { month: 'short', day: 'numeric' })}</span></div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" disabled={loading || document.status === 'verified'} onClick={() => onApprove(document)} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-45 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"><Check className="size-3.5" />Approve</button>
          <button type="button" disabled={loading || document.status === 'rejected'} onClick={() => onReject(document)} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-45 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"><X className="size-3.5" />Reject</button>
        </div>
      </div>
    </motion.article>
  );
}
