export function TrexMark({ size = 24, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M24 4.5 41 14v20L24 43.5 7 34V14L24 4.5Z"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <path d="M15 16h18" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M24 16v16" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M18 32h12" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="7" cy="14" r="2.2" fill="currentColor" />
      <circle cx="41" cy="14" r="2.2" fill="currentColor" />
      <circle cx="24" cy="43.5" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function TrexLogo({ compact = false, className = '' }) {
  return (
    <span className={`trex-logo ${compact ? 'trex-logo--compact' : ''} ${className}`.trim()}>
      <span className="trex-logo__mark">
        <TrexMark size={22} />
      </span>
      {!compact ? (
        <span className="trex-logo__copy">
          <strong>T-REX</strong>
          <small>Capital Market</small>
        </span>
      ) : null}
    </span>
  );
}
