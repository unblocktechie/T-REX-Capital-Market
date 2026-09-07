export function TrexMark({ size = 24, className = '' }) {
  return (
    <img
      className={`trex-mark-image ${className}`.trim()}
      src="/trex-shield.png"
      height={size}
      alt=""
      aria-hidden="true"
      draggable="false"
    />
  );
}

export function TrexLogo({ compact = false, className = '' }) {
  return (
    <span className={`trex-logo ${compact ? 'trex-logo--compact' : ''} ${className}`.trim()}>
      <span className="trex-logo__mark">
        <TrexMark size={31} />
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
