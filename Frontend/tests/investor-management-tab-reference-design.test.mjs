import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('reference-style tabs show icons, an active underline and existing actionable counts', async () => {
  const jsx = await read('../src/pages/issuer/IssuerInvestorManagementPage.jsx');
  const css = await read('../src/assets/styles/investor.css');
  assert.match(jsx, /investors: UsersRound/);
  assert.match(jsx, /'investment-requests': FileClock/);
  assert.match(jsx, /'redemption-requests': ArrowLeftRight/);
  assert.match(jsx, /<TabIcon className="issuer-investor-management__tab-icon" aria-hidden="true" \/>/);
  assert.match(jsx, /tabAttentionCounts\[tab\.id\] > 0/);
  assert.match(css, /\.issuer-investor-management__tab\.is-active\s*\{[^}]*border-bottom-color:/s);
  assert.match(css, /\.issuer-investor-management__attention-count\s*\{/);
  assert.match(css, /\.issuer-investor-management__tabs\s*\{[^}]*overflow-x:\s*auto;/s);
});

test('directory location only displays full country without a short code below it', async () => {
  const directory = await read('../src/pages/issuer/IssuerInvestorDirectoryPage.jsx');
  const locationColumn = directory.match(/key: 'location',[\s\S]*?(?=\n    },\n    \{\n      key: 'walletAddress')/)?.[0];
  assert.ok(locationColumn, 'Expected existing location column');
  assert.match(locationColumn, /investor\.country/);
  assert.doesNotMatch(locationColumn, /investor\.countryCode/);
  assert.doesNotMatch(locationColumn, /<small>/);
});
