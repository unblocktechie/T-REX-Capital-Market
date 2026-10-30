import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/pages/tokens/TokenDetailsPage.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/assets/styles/token-issuance.css', import.meta.url), 'utf8');
const description = page.slice(page.indexOf('function TokenDescription('), page.indexOf('function BlockedCountriesControl('));

test('Token Management renders the backend description unchanged and independently from price controls', () => {
  assert.match(page, /<TokenDescription key=\{information\.description\} description=\{information\.description\} \/>/);
  assert.match(description, /\{description\}/);
  assert.match(page, /<div className="token-dashboard-pricing">/);
});

test('long descriptions start collapsed and show a working accessible toggle', () => {
  assert.match(description, /useState\(false\)/);
  assert.match(description, /text\.scrollHeight > text\.clientHeight \+ 1/);
  assert.match(description, /setExpanded\(\(value\) => !value\)/);
  assert.match(description, /aria-expanded=\{expanded\}/);
  assert.match(description, /aria-controls=\{textId\}/);
  assert.match(description, /expanded \? 'Show less' : 'Show more'/);
  assert.match(css, /\.token-dashboard-header--simplified \.token-dashboard-description__text--collapsed\s*\{[^}]*-webkit-line-clamp: 3;[^}]*overflow: hidden;/s);
});

test('toggle only appears for actually overflowing text and responds to width changes', () => {
  assert.match(description, /\{canExpand \? \(/);
  assert.match(description, /new ResizeObserver\(measure\)/);
  assert.match(description, /window\.addEventListener\('resize', measure\)/);
  assert.match(description, /observer\?\.disconnect\(\)/);
  assert.match(description, /window\.removeEventListener\('resize', measure\)/);
  assert.match(css, /\.token-dashboard-header--simplified \.token-dashboard-description\s*\{[^}]*grid-column: 1 \/ -1;[^}]*min-width: 0;/s);
  assert.match(css, /\.token-dashboard-header--simplified \.token-dashboard-description__text\s*\{[^}]*overflow-wrap: anywhere;/s);
  assert.match(css, /\.token-dashboard-header--simplified \.token-dashboard-description__toggle:focus-visible\s*\{/);
});

test('short descriptions and empty descriptions stay simple', () => {
  assert.match(page, /\{information\.description \? \(\s*<TokenDescription/s);
  assert.match(description, /const \[canExpand, setCanExpand\] = useState\(false\)/);
});
