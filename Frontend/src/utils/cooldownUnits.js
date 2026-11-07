// Display-only units: the API continues to receive cooldownSeconds as a whole-second string.
export const COOLDOWN_UNITS = Object.freeze([
  { value: 'seconds', label: 'Seconds', multiplier: 1 },
  { value: 'minutes', label: 'Minutes', multiplier: 60 },
  { value: 'hours', label: 'Hours', multiplier: 3600 },
  { value: 'days', label: 'Days', multiplier: 86400 },
]);

const multiplierFor = (unit) => COOLDOWN_UNITS.find((item) => item.value === unit)?.multiplier;

// Prefer easy-to-read whole-unit values for previously saved policies.
export function preferredCooldownUnit(seconds) {
  const value = Number(seconds);
  if (!seconds || !Number.isSafeInteger(value) || value <= 0) return 'seconds';
  if (value % 86400 === 0) return 'days';
  if (value % 3600 === 0) return 'hours';
  if (value % 60 === 0) return 'minutes';
  return 'seconds';
}

// Switching display units never changes the policy's stored duration. Repeating
// decimals can only be displayed approximately; the original seconds remain intact.
export function cooldownAmountFromSeconds(seconds, unit) {
  if (seconds === '' || seconds === null || seconds === undefined) return '';
  const multiplier = multiplierFor(unit);
  const number = Number(seconds);
  if (!multiplier || !Number.isSafeInteger(number) || number < 0) return '';
  return String(Number((number / multiplier).toFixed(8)));
}

// Present configured second-based limits in the unit currently selected by the user.
// An exact seconds value is included where the unit conversion repeats forever.
const displayBound = (seconds, unit, multiplier) => {
  const value = seconds / multiplier;
  const rounded = Number(value.toFixed(8));
  const readable = rounded.toLocaleString('en-US', { maximumFractionDigits: 8 });
  const secondsHint = Math.abs(rounded * multiplier - seconds) > 0.000001
    ? ` (${seconds.toLocaleString('en-US')} seconds)` : '';
  return `${readable} ${unit}${secondsHint}`;
};

// Convert editable quantities to the backend's integer-second representation.
// Fractional minutes/hours/days are supported; their result is rounded to the
// nearest second because the API does not accept fractional seconds.
export function cooldownAmountToSeconds(input, unit, limits) {
  const amount = String(input).trim();
  if (!amount) return { seconds: '', error: '' };
  const multiplier = multiplierFor(unit);
  if (!multiplier) return { seconds: '', error: 'Choose seconds, minutes, hours or days.' };
  if (!/^\d+(?:\.\d*)?$/.test(amount)) {
    return { seconds: '', error: 'Enter a positive number (for example, 2 or 1.5).' };
  }
  if (unit === 'seconds' && !/^\d+$/.test(amount)) {
    return { seconds: '', error: 'Enter a whole number of seconds.' };
  }
  const total = Number(amount) * multiplier;
  if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) {
    return {
      seconds: '',
      error: `Cooldown cannot exceed ${displayBound(limits.cooldownMax, unit, multiplier)}.`,
    };
  }
  const seconds = Math.round(total);
  if (seconds < limits.cooldownMin) {
    return {
      seconds: '',
      error: `Cooldown must be at least ${displayBound(limits.cooldownMin, unit, multiplier)}.`,
    };
  }
  if (seconds > limits.cooldownMax) {
    return {
      seconds: '',
      error: `Cooldown cannot exceed ${displayBound(limits.cooldownMax, unit, multiplier)}.`,
    };
  }
  return { seconds: String(seconds), error: '' };
}
