import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { COOLDOWN_UNITS, cooldownAmountFromSeconds, cooldownAmountToSeconds, preferredCooldownUnit } from '../src/utils/cooldownUnits.js';
import { normalizePolicy, serializePolicy, validatePolicy, DEFAULT_POLICY_LIMITS } from '../src/utils/botPolicy.js';

const editor = await readFile(new URL('../src/components/issuer/BotPolicyEditor.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/assets/styles/organization.css', import.meta.url), 'utf8');
const limits = DEFAULT_POLICY_LIMITS;
const asSeconds = (value, unit) => cooldownAmountToSeconds(value, unit, limits);

test('all user-selectable duration units convert correctly to integer seconds', () => {
  assert.deepEqual(asSeconds('30', 'seconds'), { seconds: '30', error: '' });
  assert.deepEqual(asSeconds('5', 'minutes'), { seconds: '300', error: '' });
  assert.deepEqual(asSeconds('1.5', 'minutes'), { seconds: '90', error: '' });
  assert.deepEqual(asSeconds('2', 'hours'), { seconds: '7200', error: '' });
  assert.deepEqual(asSeconds('0.5', 'hours'), { seconds: '1800', error: '' });
  assert.deepEqual(asSeconds('1', 'days'), { seconds: '86400', error: '' });
  assert.deepEqual(asSeconds('30', 'days'), { seconds: '2592000', error: '' });
  assert.deepEqual(asSeconds('', 'days'), { seconds: '', error: '' });
  // As the wire contract is whole seconds, fractions round to nearest second.
  assert.deepEqual(asSeconds('0.516667', 'minutes'), { seconds: '31', error: '' });
  assert.deepEqual(asSeconds('0.02', 'minutes'), { seconds: '', error: 'Cooldown must be at least 0.5 minutes.' });
});


test('validation errors match the chosen time unit, not backend seconds', () => {
  assert.equal(asSeconds('29', 'seconds').error, 'Cooldown must be at least 30 seconds.');
  assert.equal(asSeconds('2592001', 'seconds').error, 'Cooldown cannot exceed 2,592,000 seconds.');
  assert.equal(asSeconds('0.1', 'minutes').error, 'Cooldown must be at least 0.5 minutes.');
  assert.equal(asSeconds('43201', 'minutes').error, 'Cooldown cannot exceed 43,200 minutes.');
  assert.equal(asSeconds('0.001', 'hours').error, 'Cooldown must be at least 0.00833333 hours (30 seconds).');
  assert.equal(asSeconds('721', 'hours').error, 'Cooldown cannot exceed 720 hours.');
  assert.equal(asSeconds('0.0001', 'days').error, 'Cooldown must be at least 0.00034722 days (30 seconds).');
  assert.equal(asSeconds('50', 'days').error, 'Cooldown cannot exceed 30 days.');
  assert.equal(asSeconds('10000000000000', 'days').error, 'Cooldown cannot exceed 30 days.');
  // Limits can be supplied by the backend and must not be hard-coded in messages.
  assert.equal(cooldownAmountToSeconds('6', 'minutes', { cooldownMin: 120, cooldownMax: 300 }).error,
    'Cooldown cannot exceed 5 minutes.');
  assert.equal(cooldownAmountToSeconds('1', 'minutes', { cooldownMin: 120, cooldownMax: 300 }).error,
    'Cooldown must be at least 2 minutes.');
});

test('conversion never submits a fractional, negative, oversized or out-of-range duration', () => {
  for (const [value, unit] of [
    ['29', 'seconds'], ['30.5', 'seconds'], ['0', 'days'], ['-1', 'minutes'],
    ['31', 'days'], ['0.1', 'seconds'], ['1e6', 'hours'], ['Infinity', 'seconds'],
    ['3:00', 'hours'], ['1', 'weeks'],
  ]) {
    const result = asSeconds(value, unit);
    assert.notEqual(result.error, '', `Expected ${value} ${unit} to be rejected`);
  }
  assert.deepEqual(cooldownAmountToSeconds('2', 'minutes', { cooldownMin: 150, cooldownMax: 300 }).seconds, '');
  assert.deepEqual(cooldownAmountToSeconds('3', 'minutes', { cooldownMin: 150, cooldownMax: 300 }), { seconds: '180', error: '' });
});

test('unit selection preserves the previous seconds duration including legacy odd values', () => {
  assert.equal(preferredCooldownUnit(''), 'seconds');
  assert.equal(preferredCooldownUnit('31'), 'seconds');
  assert.equal(preferredCooldownUnit('90'), 'seconds');
  assert.equal(preferredCooldownUnit('300'), 'minutes');
  assert.equal(preferredCooldownUnit('3600'), 'hours');
  assert.equal(preferredCooldownUnit('86400'), 'days');
  assert.equal(cooldownAmountFromSeconds('300', 'minutes'), '5');
  assert.equal(cooldownAmountFromSeconds('3600', 'hours'), '1');
  assert.equal(cooldownAmountFromSeconds('86400', 'days'), '1');
  assert.equal(cooldownAmountFromSeconds('31', 'minutes'), '0.51666667');
});

test('backend wire format remains cooldownSeconds without an added unit field', () => {
  const base = normalizePolicy({ allowedIps: ['49.36.89.50'], frequency: 'daily', allowedDays: ['Mon'], timezone: 'UTC' });
  const converted = asSeconds('1.5', 'hours');
  const draft = { ...base, cooldownSeconds: converted.seconds };
  assert.equal(validatePolicy(draft), '');
  const body = serializePolicy(draft);
  assert.equal(body.cooldownSeconds, '5400');
  assert.equal(body.frequency, 'daily');
  assert.deepEqual(body.allowedDays, ['Mon']);
  assert.deepEqual(body.allowedIps, ['49.36.89.50']);
  assert.equal(Object.hasOwn(body, 'cooldownUnit'), false);
  assert.equal(serializePolicy({ ...draft, cooldownSeconds: asSeconds('', 'days').seconds }).cooldownSeconds, null);
});

test('cooldown editor has an accessible styled dropdown, inline validation and keeps the save contract', () => {
  assert.deepEqual(COOLDOWN_UNITS.map((unit) => unit.label), ['Seconds', 'Minutes', 'Hours', 'Days']);
  assert.match(editor, /COOLDOWN_UNITS\.map/);
  assert.match(editor, /aria-haspopup="listbox"/);
  assert.match(editor, /role="option"/);
  assert.match(editor, /aria-selected=\{unit.value === value\}/);
  assert.match(editor, /onChange=\{changeCooldownUnit\}/);
  assert.match(editor, /changeCooldownAmount\(event.target.value\)/);
  assert.match(editor, /if \(cooldownError\) \{/);
  assert.match(editor, /updateApiKeyPolicy\(selected.uid, serializePolicy/);
  assert.match(editor, /resetCooldown\(\)/);
  assert.match(css, /bot-schedule__cooldown-entry/);
  assert.match(css, /bot-schedule__unit-menu/);
  assert.match(css, /bot-schedule__unit-option/);
  assert.match(editor, /handleOptionKeyDown/);
  assert.match(editor, /setShowAbove/);
  assert.match(css, /bot-schedule__unit-menu.is-above/);
  assert.match(editor, /document.addEventListener\('pointerdown', dismiss\)/);
  assert.doesNotMatch(editor, /Allowed: \{bounds.cooldownMin.toLocaleString\(\)\}–\{bounds.cooldownMax.toLocaleString\(\)\} seconds\./);
  assert.doesNotMatch(editor, /bot-cooldown-help/);
  assert.match(editor, /aria-describedby=\{cooldownError \? 'bot-cooldown-error' : undefined\}/);
  assert.doesNotMatch(editor, /Enter a duration or choose Off for no cooldown/);
  assert.doesNotMatch(editor, /sent to the backend in seconds\./);
  assert.match(css, /@media \(max-width: 375px\)/);
});


test('cooldown unit selector icons are defined so Update Schedule renders safely', () => {
  const lucideImport = editor.match(/import\s*\{([^}]+)\}\s*from\s*'lucide-react'/)?.[1] || '';
  assert.match(editor, /<ChevronDown\s/);
  assert.match(lucideImport, /\bChevronDown\b/, 'ChevronDown icon must be imported from lucide-react');
});
