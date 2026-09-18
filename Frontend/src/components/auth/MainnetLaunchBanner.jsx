import { Megaphone } from 'lucide-react';

import { appConfig } from '@/config/app.config';

export function MainnetLaunchBanner() {
  const banner = appConfig.mainnetLaunchBanner;
  const cta = banner.url ? (
    <a
      href={banner.url}
      target="_blank"
      rel="noopener noreferrer"
      className="cursor-pointer font-medium text-inherit underline decoration-[rgba(15,23,42,0.48)] underline-offset-[3px] transition-opacity hover:opacity-70 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
    >
      {banner.ctaLabel} <span aria-hidden="true">→</span>
    </a>
  ) : (
    <span
      className="font-medium text-inherit underline decoration-[rgba(15,23,42,0.38)] underline-offset-[3px]"
      title="T-REX Capital Market is now live on Arc Mainnet."
    >
      {banner.ctaLabel} <span aria-hidden="true">→</span>
    </span>
  );

  return (
    <aside
      className="relative z-50 flex min-h-10 shrink-0 items-center justify-center border-b border-[#d39a4d] bg-[#F5C542] px-4 py-2 text-center text-[14px] leading-5 text-[#16231f] sm:text-[15px]"
      aria-label="Mainnet launch announcement"
    >
      <p className="m-0 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5">
        <Megaphone
          className="size-[18px] shrink-0 text-[#4f3a18]"
          strokeWidth={2}
          aria-hidden="true"
        />
        <strong className="font-semibold">{banner.message}</strong>
        {cta}
      </p>
    </aside>
  );
}
