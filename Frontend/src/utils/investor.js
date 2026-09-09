export const formatFileSize = (bytes = 0) => {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export function scrollToFirstInvalid(formElement) {
  window.requestAnimationFrame(() => {
    const target = formElement?.querySelector('[aria-invalid="true"], .is-error');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof target?.focus === 'function') target.focus({ preventScroll: true });
  });
}
