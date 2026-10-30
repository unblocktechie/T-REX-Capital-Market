import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/pages/tokens/TokenDetailsPage.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/assets/styles/token-issuance.css', import.meta.url), 'utf8');

const cardMarkup = page.slice(page.indexOf('<div className="token-dashboard-grid token-dashboard-grid--simplified">'));

test('desktop cards stretch to equal height without fixed heights or overflow clipping', () => {
  assert.match(css, /\.token-dashboard-grid--simplified\s*\{[^}]*align-items:\s*stretch/s);
  assert.match(css, /\.token-dashboard-grid--simplified > \.token-dashboard-card\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s);
  assert.match(css, /\.token-dashboard-grid--simplified > \.token-dashboard-card > \.token-dashboard-card__body\s*\{[^}]*flex:\s*1;/s);
  assert.match(css, /@media \(max-width: 840px\)\s*\{\s*\/\* Stacked cards[^}]*\.token-dashboard-grid--simplified\s*\{[^}]*align-items:\s*start;/s);
  assert.doesNotMatch(css, /\.token-dashboard-grid--simplified[^}]*height:\s*\d+px/s);
});

test('blocked-country count uses original API-derived list without persistent chips', () => {
  assert.match(page, /const countryNames = \(compliance\.countries \|\| \[\]\)/);
  assert.match(cardMarkup, /label="Blocked countries"\s*value=\{<BlockedCountriesControl countries=\{countryNames\} \/>\}/s);
  assert.doesNotMatch(cardMarkup, /token-dashboard-country-list/);
  assert.match(page, /const countLabel = `\$\{count\} \$\{count === 1 \? 'country' : 'countries'\}`/);
  assert.match(page, /if \(!count\) return <span>No blocked countries<\/span>;/);
  assert.match(page, /countries\.map\(\(country, index\) =>/);
});

test('popover and mobile dialog preserve the complete list and accessibility', () => {
  assert.match(page, /createPortal\(/);
  assert.match(page, /aria-haspopup="dialog"/);
  assert.match(page, /aria-expanded=\{open\}/);
  assert.match(page, /aria-controls=\{open && !isMobile \? popoverId : undefined\}/);
  assert.match(page, /closeOnOutsideClick/);
  assert.match(page, /closeOnEscape/);
  assert.match(page, /role="dialog"\s*aria-modal="false"/);
  assert.match(page, /<Modal\s+open=\{open\}[\s\S]*?trapFocus/s);
  assert.match(css, /\.token-dashboard-country-scroll\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /\.token-dashboard-country-popover\s*\{[^}]*position:\s*fixed;/s);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.token-dashboard-country-modal \.token-dashboard-country-scroll\s*\{\s*max-height:\s*55dvh;/);
});
