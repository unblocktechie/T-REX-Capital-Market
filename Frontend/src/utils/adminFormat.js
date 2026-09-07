export const formatAdminDate = (value, options = {}) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  }).format(new Date(value));
};

export const formatAdminDateTime = (value) =>
  formatAdminDate(value, { hour: 'numeric', minute: '2-digit' });

export const formatFileSize = (bytes = 0) => {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const number = bytes / 1024 ** index;
  return `${number.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

export const shortWallet = (address, start = 6, end = 5) =>
  address ? `${address.slice(0, start)}…${address.slice(-end)}` : 'Not connected';
