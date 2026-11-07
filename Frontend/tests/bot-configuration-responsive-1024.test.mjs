import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const base = process.cwd();
const header = fs.readFileSync(path.join(base, 'src/layouts/components/Header.jsx'), 'utf8');
const globalCss = fs.readFileSync(path.join(base, 'src/assets/styles/global.css'), 'utf8');
const orgCss = fs.readFileSync(path.join(base, 'src/assets/styles/organization.css'), 'utf8');

 test('only Bot Configuration uses the compact-header variant', () => {
  assert.match(header, /location\.pathname === ROUTES\.issuerApiKeys/);
  assert.match(header, /app-header--bot-configuration/);
  assert.match(globalCss, /@media \(min-width: 901px\) and \(max-width: 1220px\)/);
  assert.match(globalCss, /\.app-header--bot-configuration \.header-page-title\s*\{\s*display:\s*none/);
  assert.match(globalCss, /\.app-header--bot-configuration \.app-network-switcher__label strong/);
});

 test('four navigation cards use two columns before becoming too narrow at laptop widths', () => {
  assert.match(orgCss, /@media \(min-width: 561px\) and \(max-width: 1100px\)/);
  assert.match(orgCss, /\.bot-config__tabs\s*\{\s*display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

 test('weekday controls use equal-width buttons and equal-size checkmarks', () => {
  assert.match(orgCss, /\.bot-schedule__row \.bot-config__weekday-options\s*\{\s*grid-template-columns: repeat\(auto-fit/);
  assert.match(orgCss, /\.bot-schedule__row \.bot-config__weekday-tick\s*\{[^}]*flex: 0 0 13px/s);
  assert.match(orgCss, /\.bot-schedule__row \.bot-config__weekday-tick svg\s*\{[^}]*width: 12px;[^}]*height: 12px/s);
});

 test('last used is aligned to the far right while narrow phones can stack it safely', () => {
  assert.match(orgCss, /@container issuer-api-key-list \(max-width: 850px\)/);
  assert.match(orgCss, /\.issuer-api-key-row__meta > span:last-child\s*\{\s*justify-self: end/);
  assert.match(orgCss, /@container issuer-api-key-list \(min-width: 421px\) and \(max-width: 590px\)/);
  assert.match(orgCss, /@container issuer-api-key-list \(max-width: 420px\)/);
});
