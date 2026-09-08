import { useRef } from 'react';

export function OTPInput({ value = '', onChange, length = 6 }) {
  const refs = useRef([]);
  const digits = value.padEnd(length, ' ').slice(0, length).split('');

  const update = (index, nextValue) => {
    const digit = nextValue.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit || ' ';
    onChange(next.join('').replace(/ /g, ''));
    if (digit && index < length - 1) refs.current[index + 1]?.focus();
  };

  const onKeyDown = (event, index) => {
    if (event.key === 'Backspace' && !digits[index].trim() && index > 0)
      refs.current[index - 1]?.focus();
  };

  const onPaste = (event) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(pasted);
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  return (
    <div className="grid grid-cols-6 gap-1.5 sm:gap-2" onPaste={onPaste}>
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          className="aspect-square min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center text-xl font-semibold text-[var(--text)] outline-none transition-[border-color,box-shadow] focus:border-[var(--primary-500)] focus:shadow-[0_0_0_4px_rgba(22,119,210,0.13)] sm:text-[23px]"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Digit ${index + 1}`}
          value={digits[index].trim()}
          onChange={(event) => update(index, event.target.value)}
          onKeyDown={(event) => onKeyDown(event, index)}
        />
      ))}
    </div>
  );
}
