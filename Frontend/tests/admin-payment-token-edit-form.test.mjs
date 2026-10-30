import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/admin/AdminNetworksPage.jsx', import.meta.url), 'utf8');
const apiSource = await readFile(new URL('../src/api/admin/adminNetwork.api.js', import.meta.url), 'utf8');

test('edit modal loads authoritative payment-token detail before enabling edits', () => {
  assert.match(source, /adminNetworkApi\.getPaymentToken\(paymentTokenUid\)/);
  assert.match(source, /setForm\(paymentFormState\(currentToken\)\)/);
  assert.match(source, /const formDisabled = mutation\.isPending \|\| \(editing && !detailReady\)/);
});

test('payment-token detail endpoint normalizes canonical backend fields', () => {
  assert.match(apiSource, /normalizePaymentTokenFields\(payload\?\.paymentToken \|\| payload\?\.token \|\| payload \|\| \{\}\)/);
});
