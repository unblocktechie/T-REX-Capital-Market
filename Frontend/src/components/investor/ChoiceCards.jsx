import { Check } from 'lucide-react';
import { cn } from '@/utils/cn';

export function RadioCardGroup({ legend, options, value, onChange, error, columns = 1, required = false, name, compact = false }) {
  return (
    <fieldset className={cn('investor-choice-fieldset', compact && 'investor-choice-fieldset--compact')}>
      <legend>
        {legend}
        {required ? <span className="org-required-mark" aria-hidden="true">*</span> : null}
      </legend>
      <div className={cn('investor-choice-grid', columns === 2 && 'investor-choice-grid--two', columns === 3 && 'investor-choice-grid--three')}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <label key={option.value} className={cn('investor-choice-card', selected && 'is-selected')}>
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                aria-invalid={Boolean(error)}
              />
              <span className="investor-choice-card__marker" aria-hidden="true">
                {selected ? <Check size={14} /> : null}
              </span>
              <span>
                <strong>{option.label}</strong>
                {option.description ? <small>{option.description}</small> : null}
              </span>
            </label>
          );
        })}
      </div>
      {error ? <p className="org-field__error" role="alert">{error}</p> : null}
    </fieldset>
  );
}

export function CheckboxCardGroup({ legend, options, value = [], onChange, error, columns = 2, required = false, compact = false }) {
  const toggle = (optionValue) => {
    const next = value.includes(optionValue)
      ? value.filter((item) => item !== optionValue)
      : [...value, optionValue];
    onChange(next);
  };

  return (
    <fieldset className={cn('investor-choice-fieldset', compact && 'investor-choice-fieldset--compact')}>
      <legend>
        {legend}
        {required ? <span className="org-required-mark" aria-hidden="true">*</span> : null}
      </legend>
      <div className={cn('investor-choice-grid', columns === 2 && 'investor-choice-grid--two')}>
        {options.map((option) => {
          const selected = value.includes(option.value);
          return (
            <label key={option.value} className={cn('investor-choice-card', selected && 'is-selected')}>
              <input
                type="checkbox"
                value={option.value}
                checked={selected}
                onChange={() => toggle(option.value)}
                aria-invalid={Boolean(error)}
              />
              <span className="investor-choice-card__marker investor-choice-card__marker--square" aria-hidden="true">
                {selected ? <Check size={14} /> : null}
              </span>
              <span><strong>{option.label}</strong></span>
            </label>
          );
        })}
      </div>
      {error ? <p className="org-field__error" role="alert">{error}</p> : null}
    </fieldset>
  );
}
