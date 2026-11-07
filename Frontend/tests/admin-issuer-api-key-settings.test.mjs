import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routes = await readFile(new URL('../src/config/routes.js', import.meta.url), 'utf8');
const router = await readFile(new URL('../src/routes/router.jsx', import.meta.url), 'utf8');
const navigation = await readFile(new URL('../src/layouts/admin/admin.navigation.js', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/api/admin/adminIssuerApiKeySettings.api.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/pages/admin/AdminIssuerApiKeySettingsPage.jsx', import.meta.url), 'utf8');

test('admin issuer API key settings has a dedicated route and admin navigation entry', () => {
  assert.match(routes, /adminIssuerApiKeySettings: '\/admin\/api-key-settings'/);
  assert.match(router, /const AdminIssuerApiKeySettingsPage = lazy/);
  assert.match(router, /path: 'api-key-settings'.*?<AdminIssuerApiKeySettingsPage/s);
  assert.match(navigation, /Issuer API Settings[\s\S]*?ROUTES\.adminIssuerApiKeySettings/);
});

test('admin settings API uses the global admin endpoint without selected-chain headers', () => {
  assert.match(api, /'\/admin\/issuer-api-key-settings'/);
  assert.match(api, /skipSelectedChainHeader: true/);
  assert.match(api, /apiClient\.get\(ENDPOINT/);
  assert.match(api, /apiClient\.patch\(ENDPOINT, payload/);
});

test('settings page exposes all backend configuration fields and exact validation constraints', () => {
  for (const field of [
    'IssuerApiKeyMaxActive',
    'TokenPriceRelaySignatureTtlSeconds',
    'TokenPriceRelayRateLimitCount',
    'TokenPriceRelayRateLimitWindowSeconds',
    'TokenPriceApiReadRateLimitCount',
    'TokenPriceApiReadRateLimitWindowSeconds',
  ]) assert.match(page, new RegExp(field));
  assert.match(page, /MAX_SETTING_VALUE = 1_000_000/);
  assert.match(page, /TokenPriceRelaySignatureTtlSeconds:[\s\S]*?min: 60/);
  assert.match(page, /Number\.isInteger/);
});

test('PATCH submits only valid changed fields and prevents empty updates', () => {
  assert.match(page, /form\[key\] !== baseline\[key\]/);
  assert.match(page, /const hasChanges = Object\.keys\(changedPayload\)\.length > 0/);
  assert.match(page, /if \(!hasChanges \|\| !isValid \|\| updateMutation\.isPending \|\| pendingReview\) return/);
  assert.match(page, /setPendingReview\(\{/);
  assert.match(page, /updateMutation\.mutate\(pendingReview\.payload\)/);
});

test('page communicates runtime behavior and responsive admin controls', () => {
  assert.match(page, /Changes apply immediately/);
  assert.match(page, /API keys per issuer/);
  assert.match(page, /Existing signed requests keep their original expiry/);
  assert.match(page, /Per issuer Service Wallet, per network/);
  assert.match(page, /Per issuer, shared across all API keys and networks/);
  assert.match(page, /sm:flex-row/);
  assert.match(page, /xl:grid-cols-2/);
  assert.match(page, /md:grid-cols-2/);
});

test('Save opens a review dialog showing only changed settings and previous/new values', () => {
  assert.match(page, /function SettingsSaveReviewModal/);
  assert.match(page, /title="Review changes"/);
  assert.match(page, /previousValue: Number\(baseline\[key\]\)/);
  assert.match(page, /nextValue: payload\[key\]/);
  assert.match(page, /Object\.keys\(payload\)\.map/);
  assert.match(page, /<span>Current<\/span>/);
  assert.match(page, /<span className="text-right">New<\/span>/);
  assert.match(page, /FIELD_CONFIG\[key\]/);
  assert.match(page, /formatValue\(previousValue\)/);
  assert.match(page, /formatValue\(nextValue\)/);
});

test('Review dialog requires explicit confirmation before the PATCH and preserves the snapshot', () => {
  const save = page.slice(page.indexOf('  const save = () =>'), page.indexOf('  const closeReview = () =>'));
  assert.doesNotMatch(save, /updateMutation\.mutate/);
  assert.match(save, /const payload = \{ \.\.\.changedPayload \}/);
  assert.match(save, /setPendingReview/);
  assert.match(page, /const confirmSave = \(\) => \{/);
  assert.match(page, /updateMutation\.mutate\(pendingReview\.payload\)/);
  assert.match(page, /Confirm &amp; Save/);
  assert.match(page, /Cancel/);
  assert.match(page, /onSuccess: \(payload, submittedPayload\)/);
  assert.match(page, /setPendingReview\(null\)/);
});

test('Confirmation is accessible, responsive and prevents duplicate submission', () => {
  assert.match(page, /trapFocus/);
  assert.match(page, /dismissible=\{!saving\}/);
  assert.match(page, /loading=\{saving\}/);
  assert.match(page, /sm:max-w-2xl/);
  assert.match(page, /grid-cols-\[minmax\(0,1\.5fr\)_minmax\(0,0\.65fr\)_auto_minmax\(0,0\.8fr\)\]/);
  assert.match(page, /w-full sm:w-auto/);
  assert.match(page, /onClick=\{save\}/g);
  assert.match(page, /onConfirm=\{confirmSave\}/);
});

test('compact review uses one row per changed setting with only new values highlighted', () => {
  const modal = page.slice(page.indexOf('function SettingsSaveReviewModal('), page.indexOf('export default function AdminIssuerApiKeySettingsPage()'));
  assert.match(modal, /review\.changes\.map/);
  assert.match(modal, /role="listitem"/);
  assert.match(modal, /aria-label="Previous and new API key settings"/);
  assert.match(modal, /\{setting\.reviewLabel \|\| setting\.label\}/);
  assert.match(modal, /\{formatValue\(previousValue\)\}/);
  assert.match(modal, /\{formatValue\(nextValue\)\}/);
  assert.match(modal, /bg-blue-50/);
  assert.match(modal, /text-blue-700/);
  assert.match(modal, /text-slate-600/);
  assert.match(modal, /\{changeCount\} \{changeCount === 1/);
  assert.doesNotMatch(modal, /rounded-2xl border border-slate-200 bg-white p-3/);
});

test('review footer remains outside scrolling body and keeps actions available at mobile widths', async () => {
  const modalComponent = await readFile(new URL('../src/components/ui/Modal.jsx', import.meta.url), 'utf8');
  assert.match(modalComponent, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(modalComponent, /<footer className="flex shrink-0/);
  assert.match(page, /bodyClassName="px-4 py-4 sm:px-6 sm:py-5"/);
  assert.match(page, /w-full sm:w-auto/);
  assert.match(page, /disabled=\{saving\}/);
  assert.match(page, /Confirm &amp; Save/);
});


test('settings are grouped into four plain-language cards with optional advice and live limit summaries', () => {
  for (const title of ['API keys per issuer', 'Price signature expiry', 'Price update limit', 'API request limit']) {
    assert.match(page, new RegExp(title));
  }
  assert.match(page, /function ImpactGuidance/);
  assert.match(page, /<details className=/);
  assert.match(page, /<summary className=/);
  assert.match(page, /Impact &amp; recommendation/);
  assert.match(page, /function LimitPreview/);
  assert.match(page, /formatDuration\(windowSeconds\)/);
  assert.match(page, /Every|every/);
  assert.match(page, /Each update costs the platform gas fees/);
  assert.match(page, /do not need to restart/);
  assert.match(page, /sm:grid-cols-2/);
});

test('Review changes is the primary action and only confirmation sends PATCH', () => {
  assert.equal((page.match(/>\s*Review changes\s*<\/Button>/g) || []).length, 2);
  assert.equal((page.match(/updateMutation\.mutate\(/g) || []).length, 1);
  assert.match(page, /updateMutation\.mutate\(pendingReview\.payload\)/);
  assert.match(page, /onClick=\{save\}/);
  assert.match(page, /onClick=\{onConfirm\}/);
  assert.match(page, /Confirm &amp; Save/);
  assert.match(page, /reviewLabel: 'Price update time window'/);
  assert.match(page, /reviewLabel: 'API request time window'/);
});
