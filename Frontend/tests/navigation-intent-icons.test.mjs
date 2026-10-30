import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const tokenDetails = readFileSync(new URL('../src/pages/tokens/TokenDetailsPage.jsx', import.meta.url), 'utf8');
const networkSwitcher = readFileSync(new URL('../src/components/common/AppNetworkSwitcher.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/assets/styles/token-issuance.css', import.meta.url), 'utf8');

test('asset creation confirmation retains the dynamic explorer URL and clearly identifies the external destination', () => {
  assert.match(tokenDetails, /<a className="token-dashboard-technical__transaction" href=\{transactionExplorer\} target="_blank" rel="noopener noreferrer">\s*<span>View asset creation confirmation<\/span>\s*<ExternalLink size=\{15\} aria-hidden="true" \/>\s*<\/a>/);
  assert.match(tokenDetails, /transactionExplorer \? \(/);
  assert.match(styles, /\.token-dashboard-technical__transaction\s*\{[^}]*align-items: center;[^}]*gap: 7px;[^}]*max-width: 100%/s);
});

test('Manage network access stays in the app and uses a chevron rather than the external-link glyph', () => {
  assert.match(networkSwitcher, /<Link\s+to=\{ROUTES\.chainAccess\}/);
  assert.match(networkSwitcher, /<span>Manage network access<\/span>\s*<ChevronRight size=\{16\} className="shrink-0" aria-hidden="true" \/>/);
  assert.doesNotMatch(networkSwitcher, /ExternalLink/);
  assert.match(networkSwitcher, /onClick=\{\(\) => setOpen\(false\)\}/);
});
