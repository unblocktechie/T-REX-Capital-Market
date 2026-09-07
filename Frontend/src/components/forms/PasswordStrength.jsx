import { cn } from '@/utils/cn';

const checks = [
  (value) => value.length >= 8,
  (value) => /[a-z]/.test(value) && /[A-Z]/.test(value),
  (value) => /\d/.test(value),
  (value) => /[^A-Za-z0-9]/.test(value),
];

const activeColors = {
  1: 'bg-[var(--danger-500)]',
  2: 'bg-[var(--warning-500)]',
  3: 'bg-[#d3b234]',
  4: 'bg-[var(--success-500)]',
};

export function PasswordStrength({ value = '' }) {
  const score = checks.filter((check) => check(value)).length;
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
  return (
    <div className="-mt-1.5 flex items-center gap-2.5" aria-live="polite">
      <div className="grid flex-1 grid-cols-4 gap-[5px]">
        {checks.map((_, index) => (
          <span
            key={index}
            className={cn(
              'h-1 rounded-full transition-colors duration-200',
              index < score ? activeColors[score] : 'bg-[var(--border)]',
            )}
          />
        ))}
      </div>
      <small className="min-w-13 text-right text-[var(--text-muted)]">{labels[score]}</small>
    </div>
  );
}
