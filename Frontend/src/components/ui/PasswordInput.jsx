import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { Input } from './Input';

export function PasswordInput(props) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      leading={LockKeyhole}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          className="grid size-[34px] shrink-0 place-items-center rounded-[10px] border border-transparent bg-transparent text-[var(--text-soft)] transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      }
    />
  );
}
