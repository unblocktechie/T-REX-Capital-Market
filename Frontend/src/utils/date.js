import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export const formatDate = (value, format = 'DD MMM YYYY') =>
  value ? dayjs(value).format(format) : '—';

export const fromNow = (value) => (value ? dayjs(value).fromNow() : '—');
