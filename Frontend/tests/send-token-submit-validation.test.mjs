import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../src/pages/investor-portal/SendTokenPage.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/assets/styles/investor.css', import.meta.url), 'utf8');

// Evaluate the actual submit-time guard with mocked UI dependencies, without
// needing to connect a live wallet or load the full React application.
const submitGuardSource = page.match(/  const validateFormForNewIntent = \(\) => \{[\s\S]*?\n  \};/);
assert.ok(submitGuardSource, 'Send flow has a submit-time validation function');

const evaluateGuard = ({ walletReady = true, recipientReady = true, recipientError = '', amount = '2', amountError = '' } = {}) => {
  const notifications = [];
  const focusedFields = [];
  const attempts = [];
  const dependencies = {
    setSubmitAttempted: (value) => attempts.push(value),
    walletGuard: { ready: walletReady },
    recipientReady,
    recipientError,
    recipientInputRef: { current: { focus: () => focusedFields.push('recipient') } },
    amountInputRef: { current: { focus: () => focusedFields.push('amount') } },
    normalizedAmount: amount,
    isPositiveDecimal: (value) => /^\d+(?:\.\d+)?$/.test(value) && /[1-9]/.test(value),
    amountError,
    toast: { error: (message) => notifications.push(message) },
  };
  const run = new Function(...Object.keys(dependencies), `${submitGuardSource[0]}\nreturn validateFormForNewIntent();`);
  return { valid: run(...Object.values(dependencies)), attempts, notifications, focusedFields };
};

test('recipient check is not a separate step and Send is not gated on the old checked flag', () => {
  assert.doesNotMatch(page, /\baddressChecked\b|\bcheckRecipient\b|>\s*Check recipient\s*</);
  assert.match(page, /const canPrepareNew = Boolean\(walletGuard\.ready && !transferBusy\)/);
  assert.match(page, /if \(!validateFormForNewIntent\(\)\) return;/);
  assert.match(page, /ref=\{recipientInputRef\}/);
  assert.match(page, /ref=\{amountInputRef\}/);
});

test('Send checks the connected wallet before submitting', () => {
  const result = evaluateGuard({ walletReady: false });
  assert.equal(result.valid, false);
  assert.deepEqual(result.attempts, [true]);
  assert.match(result.notifications[0], /Connect the investor wallet/);
});

test('Send rejects missing, malformed, or own recipient wallet addresses', () => {
  for (const recipientError of ['', 'Enter a valid recipient account address.', 'Choose a recipient wallet different from your registered investment wallet.']) {
    const result = evaluateGuard({ recipientReady: false, recipientError });
    assert.equal(result.valid, false);
    assert.deepEqual(result.focusedFields, ['recipient']);
    assert.equal(result.notifications[0], recipientError || 'Enter a recipient account address to continue.');
  }
});

test('Send rejects missing, invalid, and excessive amounts', () => {
  for (const [amount, amountError] of [['', ''], ['0', ''], ['5', 'The transfer amount cannot exceed your available balance.']]) {
    const result = evaluateGuard({ amount, amountError });
    assert.equal(result.valid, false);
    assert.deepEqual(result.focusedFields, ['amount']);
    assert.ok(result.notifications[0]);
  }
});

test('valid recipient and amount can proceed through existing wallet transfer flow', () => {
  assert.equal(evaluateGuard().valid, true);
  assert.match(page, /await submitInvestorTokenTransfer\(/);
  assert.match(page, /sendInProgressRef\.current/);
  assert.match(page, /saveObservedWalletTransaction\(/);
});

test('recipient field expands within its card for narrow viewport sizes', () => {
  assert.match(css, /\.investor-token-send-page \.investor-token-action-text-field \{\s*box-sizing: border-box;\s*width: 100%;\s*max-width: 100%;/);
  assert.match(css, /@media \(max-width: 820px\) \{\s*\.investor-token-action-layout \{\s*grid-template-columns: 1fr;/);
});
