import { motion } from 'framer-motion';
import { CheckCircle2, FileCheck2, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { TrexLogo, TrexMark } from '@/components/branding/TrexLogo';
import { appConfig } from '@/config/app.config';

const points = [
  ['Issuer ready', 'Build and manage compliant digital-security offerings.', FileCheck2],
  ['Investor friendly', 'Guide users through identity and eligibility checks.', UserRoundCheck],
  ['Compliance first', 'Apply transfer controls and verification rules on-chain.', ShieldCheck],
];

export function AuthLayout() {
  return (
    <main className="relative min-h-dvh w-full max-w-full overflow-x-hidden bg-[linear-gradient(180deg,#edf2f8_0%,#f8fafc_28%,#ffffff_100%)] text-[var(--text)] max-[900px]:grid max-[900px]:place-items-center min-[901px]:grid min-[901px]:h-dvh min-[901px]:min-h-0 min-[901px]:grid-cols-[minmax(420px,1.08fr)_minmax(480px,0.92fr)] min-[901px]:overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[220px] bg-[radial-gradient(circle_at_top,rgba(30,64,175,0.08),transparent_58%)] max-[900px]:block min-[901px]:hidden" />
      <div className="pointer-events-none absolute left-[-70px] top-[18%] size-[180px] rounded-full bg-[rgba(59,130,246,0.08)] blur-3xl max-[900px]:block min-[901px]:hidden" />
      <div className="pointer-events-none absolute bottom-[7%] right-[-60px] size-[170px] rounded-full bg-[rgba(15,23,42,0.08)] blur-3xl max-[900px]:block min-[901px]:hidden" />
      <section
        className="relative hidden h-dvh min-h-0 overflow-hidden [background:var(--auth-visual-bg)] px-[clamp(30px,5vw,78px)] py-7 text-[var(--brand-panel-text)] min-[901px]:grid min-[901px]:grid-rows-[auto_minmax(0,1fr)_auto] min-[901px]:gap-y-5"
        aria-label="T-REX Capital Market product overview"
      >
        <div className="pointer-events-none absolute inset-0 opacity-[var(--brand-grid-opacity)] [background-image:var(--brand-grid)] [background-size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
        <div className="pointer-events-none absolute top-[20%] -right-[150px] size-[420px] rounded-full bg-[var(--brand-glow-one)] opacity-80 blur-2xl" />
        <div className="pointer-events-none absolute bottom-[6%] -left-[120px] size-[300px] rounded-full bg-[var(--brand-glow-two)] opacity-75 blur-2xl" />

        <div className="relative z-10 text-[var(--brand-panel-text)]">
          <TrexLogo className="auth-trex-logo" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="relative z-10 w-full max-w-[620px] self-center"
        >
          <span className="inline-flex items-center gap-[7px] rounded-full border border-[var(--brand-panel-border)] bg-[var(--brand-panel-glass)] px-[11px] py-[7px] text-xs font-bold text-[var(--brand-panel-text)] shadow-[var(--brand-panel-shadow)] backdrop-blur-xl">
            <CheckCircle2 size={15} />
            <span>
              Powered by{' '}
              <a
                href="https://unblocktechnolabs.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-inherit underline decoration-current underline-offset-2 transition-opacity hover:text-inherit hover:opacity-75 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
              >
                Unblock Technolabs
              </a>
            </span>
          </span>
          <h1 className="my-4 max-w-[610px] font-[var(--font-display)] text-[clamp(34px,4.3vw,66px)] leading-[1.06] tracking-[-0.055em] text-[var(--brand-panel-text)] min-[901px]:max-[1100px]:text-4xl">
            Compliant digital securities, launched with confidence.
          </h1>
          <p className="mb-5 max-w-[560px] text-sm leading-6 text-[var(--brand-panel-soft)] min-[1200px]:text-base min-[1200px]:leading-7">
            T-REX Capital Market gives issuers and investors one secure journey for token creation,
            identity verification, eligibility and lifecycle management.
          </p>
          <div className="grid gap-2.5">
            {points.map(([title, text, Icon]) => (
              <div
                key={title}
                className="group flex items-center gap-3 rounded-2xl border border-transparent px-2 py-1.5 transition-all duration-200 hover:translate-x-1 hover:border-[var(--brand-panel-border)] hover:bg-[var(--brand-panel-glass)]"
              >
                <span className="grid size-[34px] shrink-0 place-items-center rounded-xl border border-[var(--brand-panel-border)] bg-[var(--brand-panel-glass)] text-[var(--brand-panel-text)] shadow-[var(--brand-panel-shadow)] transition-transform duration-200 group-hover:scale-105">
                  <Icon size={18} />
                </span>
                <p className="m-0 grid">
                  <strong className="text-[13px] text-[var(--brand-panel-text)]">{title}</strong>
                  <small className="text-[11px] leading-4 text-[var(--brand-panel-muted)]">
                    {text}
                  </small>
                </p>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="relative z-10 self-end border-t border-[var(--brand-panel-border)] pt-3 text-[11px] leading-4 text-[var(--brand-panel-muted)]">
          <p className="m-0">
            © 2026 {appConfig.companyName}. Identity-first tokenization infrastructure.
          </p>
        </div>
      </section>

      <section className="relative z-[1] min-h-dvh w-full min-w-0 max-w-full overflow-x-hidden bg-transparent px-4 py-5 sm:px-6 min-[901px]:h-dvh min-[901px]:min-h-0 min-[901px]:overflow-y-auto min-[901px]:overscroll-contain min-[901px]:bg-white min-[901px]:px-[clamp(28px,5vw,76px)] min-[901px]:py-5 max-[900px]:grid max-[900px]:place-items-center">
        <div className="mx-auto flex min-h-full w-full min-w-0 max-w-[640px] flex-col max-[900px]:min-h-0 max-[900px]:justify-center">
          <div className="mb-4 flex justify-center min-[901px]:hidden">
            <TrexLogo className="auth-trex-logo" />
          </div>
          <div className="my-auto w-full min-w-0 max-w-full py-1 max-[900px]:rounded-[30px] max-[900px]:border max-[900px]:border-[rgba(148,163,184,0.22)] max-[900px]:bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,255,255,0.92))] max-[900px]:px-5 max-[900px]:py-6 max-[900px]:shadow-[0_24px_60px_rgba(15,23,42,0.08)] max-[900px]:backdrop-blur-xl sm:max-[900px]:px-7 sm:max-[900px]:py-8">
            <div className="mb-5 hidden rounded-2xl border border-[rgba(148,163,184,0.18)] bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(51,65,85,0.92))] p-4 text-white shadow-[0_14px_34px_rgba(15,23,42,0.16)] max-[900px]:block">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/65">Secure access</p>
                  <h3 className="m-0 text-base font-semibold tracking-[-0.03em] text-white">Welcome to T-REX Capital Market</h3>
                  <p className="mt-1 mb-0 text-xs leading-5 text-white/70">Responsive, secure access for issuers and investors on every device.</p>
                </div>
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white">
                  <TrexMark size={29} />
                </span>
              </div>
            </div>
            <Outlet />
          </div>
        </div>
      </section>
    </main>
  );
}
