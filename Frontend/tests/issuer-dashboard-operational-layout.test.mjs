import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/pages/dashboard/DashboardPage.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/assets/styles/global.css', import.meta.url), 'utf8');
const issuer = page.slice(page.indexOf('function IssuerDashboardPage() {'), page.indexOf('function InvestorDashboardPage() {'));

const between = (start, finish) => issuer.slice(issuer.indexOf(start), issuer.indexOf(finish));

test('completed assets show a single, compact asset overview with existing navigation', () => {
  const hero = between('<Card className="issuer-dashboard-hero-live" data-deployed={tokenRecord.isDeployed}>', '{hasPartialErrors ? (');
  assert.match(hero, /Your investment asset is ready to manage/);
  assert.match(hero, /<strong>\{tokenName\}/);
  assert.match(hero, /<Badge tone=\{tokenStatus\.tone\}>\{tokenStatus\.label\}<\/Badge>/);
  assert.match(hero, /tokenNetwork/);
  assert.match(hero, /navigate\(primaryDestination\)/);
  assert.match(hero, /ROUTES\.issuerInvestorDirectory/);
  assert.match(hero, /<IssuerDashboardHeroIllustration \/>/);
  assert.match(hero, /issuer-dashboard-hero-summary/);
  assert.match(hero, /tokenContractAddress/);
  assert.match(hero, /savedPrice/);
  assert.doesNotMatch(hero, /Current investment asset|issuer-dashboard-token-snapshot|issuer-dashboard-next-step/);
});

test('asset setup remains available before completion but disappears after deployment', () => {
  assert.match(issuer, /\{!tokenRecord\.isDeployed \? \(\s*<section className="issuer-dashboard-live__setup-section"/);
  assert.match(issuer, /TOKEN_ISSUANCE_STEPS\.map/);
  assert.match(issuer, /workflow\.progress/);
  assert.match(issuer, /ROUTES\.createToken/);
  assert.match(issuer, /organizationNeedsSetup \? ROUTES\.organization : tokenDestination/);
  assert.ok(issuer.indexOf('<section className="issuer-dashboard-live__setup-section"') > issuer.indexOf('<section className="issuer-dashboard-live__activity-grid"'));
});

test('operational KPIs and action center use real data and original routes', () => {
  assert.match(issuer, /pendingRequests\.length \+ redemptionActions\.length/);
  assert.match(issuer, /canCountPendingActions/);
  assert.match(issuer, /label: 'Investor profiles'/);
  assert.match(issuer, /hasSectionError\('investors'\)/);
  assert.match(issuer, /label: 'Pending actions'/);
  assert.match(issuer, /to: ROUTES\.investors/);
  assert.match(issuer, /to: ROUTES\.issuerRedemptions/);
  assert.match(issuer, /to: ROUTES\.issuerInvestorDirectory/);
  assert.match(issuer, /overview\.refetch\(\)/);
  assert.match(issuer, /tokenRecord\.refetch\(\)/);
  assert.match(issuer, /organizationQuery\.refresh\(\)/);
  assert.equal((issuer.match(/<Card className="issuer-dashboard-action-card">/g) || []).length, 1);
});

test('loading, errors and empty states never imply a completed setup or nonexistent activity', () => {
  assert.match(issuer, /if \(!tokenRecord\.selectedChainUid \|\| tokenRecord\.isError \|\| organizationQuery\.error\)/);
  assert.match(issuer, /if \(isDashboardLoading\)/);
  assert.match(issuer, /Investment requests unavailable/);
  assert.match(issuer, /Redemption activity unavailable/);
  assert.match(issuer, /No investment requests yet/);
  assert.match(issuer, /No redemption activity yet/);
  assert.match(issuer, /Some actions may be unavailable/);
});

test('issuer dashboard uses the dark hero for both pre-creation and deployed states', () => {
  assert.match(css, /\.issuer-dashboard-live \.issuer-dashboard-hero-live\s*\{[^}]*background: var\(--surface\)/s);
  assert.match(css, /\.issuer-dashboard-live \.issuer-dashboard-hero-live\[data-deployed\]\s*\{[^}]*background: linear-gradient/s);
  assert.match(css, /\.issuer-dashboard-live \.issuer-dashboard-hero-live\[data-deployed="false"\]\s*\{[^}]*grid-template-columns: minmax\(0, 1\.35fr\) minmax\(185px, 0\.65fr\)/s);
  assert.match(css, /\.issuer-dashboard-live__actions-section > \.issuer-dashboard-action-card,[^}]*height: auto;/s);
  assert.match(css, /\.issuer-dashboard-live \.issuer-dashboard-list-empty\s*\{[^}]*min-height: 0;/s);
  assert.match(css, /\.issuer-dashboard-live button:focus-visible/);
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /\.issuer-dashboard-live__actions-section \.issuer-dashboard-action-item\s*\{[^}]*grid-template-columns: 36px minmax\(0, 1fr\)/s);
});

test('investor dashboard remains available and separate', () => {
  assert.match(page, /function InvestorDashboardPage\(\)/);
  assert.match(page, /getInvestorOverview/);
  assert.match(page, /function DashboardPage/);
});

test('dashboard KPI arrows are removed without disabling navigation or focus', () => {
  const metrics = between('<section className="issuer-dashboard-metric-grid" data-card-count={metricCards.length} aria-label="Issuer dashboard metrics">', '<section id="issuer-dashboard-action-center"');
  assert.doesNotMatch(metrics, /issuer-dashboard-live-metric__arrow|<ArrowRight/);
  assert.match(metrics, /onClick=\{\(\) =>/);
  assert.match(metrics, /navigate\(metric\.to\)/);
  assert.match(metrics, /disabled=\{metric\.disabled\}/);
});

test('Action Center remains one interactive row with dark CTA face and existing destination', () => {
  const actions = between('<section id="issuer-dashboard-action-center"', '<section className="issuer-dashboard-live__activity-grid">');
  assert.match(actions, /<button type="button" className=\{`issuer-dashboard-action-item/);
  assert.match(actions, /onClick=\{\(\) => navigate\(item\.to\)\}/);
  assert.match(actions, /issuer-dashboard-action-item__cta/);
  assert.match(css, /\.issuer-dashboard-live__actions-section \.issuer-dashboard-action-item__cta\s*\{[^}]*background: #26333e/s);
  assert.doesNotMatch(actions, /<button[^>]*issuer-dashboard-action-item__cta/);
});

test('new asset summary handles absent backend fields and keeps copy address action separate', () => {
  assert.match(issuer, /rawToken\.deployment\?\.contracts\?\.token/);
  assert.match(issuer, /savedPrice \? /);
  assert.match(issuer, /Saved investor price/);
  assert.match(issuer, /navigator\.clipboard\.writeText\(tokenContractAddress\)/);
  assert.match(issuer, /NetworkIcon chain=\{tokenChain\} chainId=\{tokenChainId\}/);
  assert.match(css, /@media \(max-width: 1220px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
});


test('no token uses the dark hero with artwork but no status summary and three metrics', () => {
  assert.match(issuer, /<IssuerDashboardHeroIllustration \/>\s*\{tokenRecord\.isDeployed \? \(/);
  assert.match(issuer, /\.\.\.\(tokenRecord\.hasToken \? \[canCountPendingActions/);
  assert.match(css, /\.issuer-dashboard-live \.issuer-dashboard-metric-grid\[data-card-count="3"\]\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(css, /@media \(max-width: 680px\) \{\s*\.issuer-dashboard-live \.issuer-dashboard-metric-grid\[data-card-count="3"\]/s);
  assert.match(issuer, /organizationNeedsSetup \? ROUTES\.organization : tokenDestination/);
});

test('created-token network resolves from token chain metadata or scoped chain, with correct icon', () => {
  assert.match(issuer, /getTokenRecordChainId\(rawToken\)/);
  assert.match(issuer, /getTokenRecordChainUid\(rawToken\)/);
  assert.match(issuer, /web3Config\.getChainRecordById\(recordedChainId\)/);
  assert.match(issuer, /web3Config\.getChainRecordByUid\(recordedChainUid\)/);
  assert.match(issuer, /web3Config\.getChainRecordByUid\(tokenRecord\.selectedChainUid\)/);
  assert.match(issuer, /tokenChain\?\.chainName/);
  assert.match(issuer, /<NetworkIcon chain=\{tokenChain\} chainId=\{tokenChainId\} name=\{tokenNetwork \|\| 'Network'\} size="sm" \/>/);
});
