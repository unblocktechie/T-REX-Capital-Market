import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildApplicationHistoryEntries } from '../src/utils/applicationHistoryEntries.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const verification = { id: 'verify-1', eventType: 'approved', createdAt: '2026-10-30T10:00:00Z', actorRole: 'issuer' };
const registration = { id: 'registry-1', eventType: 'registryRegistrationConfirmed', createdAt: '2026-10-30T10:03:00Z', actorRole: 'issuer' };

test('shared history presents verification and registration as two separate confirmation cards', async () => {
  const jsx = await read('../src/components/application-history/ApplicationHistory.jsx');
  const block = jsx.match(/<div className="application-history-issuer-step-events"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0];
  assert.ok(block, 'shared confirmation list exists');
  assert.equal((block.match(/className="application-history-issuer-step-event"/g) || []).length, 2);
  assert.match(block, /Required Claims Verified/);
  assert.match(block, /Identity Registry Registration Confirmed/);
  assert.match(block, /dateTime=\{combinedIssuerStep\.verification\.createdAt\}/);
  assert.match(block, /dateTime=\{combinedIssuerStep\.registration\.createdAt\}/);
  assert.equal((block.match(/<time\s/g) || []).length, 2);
  assert.equal((block.match(/<CheckCircle2\s/g) || []).length, 2);
});

test('confirmation cards form two columns when space allows and wrap when the container narrows', async () => {
  const css = await read('../src/assets/styles/investor.css');
  assert.match(css, /\.application-history-issuer-step-events\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*260px\),\s*1fr\)\);/s);
  assert.match(css, /\.application-history-issuer-step-event\s*\{[^}]*min-width:\s*0;[^}]*border:/s);
  assert.match(css, /\.application-history-issuer-step-event__content\s*\{[^}]*min-width:\s*0;/s);
  assert.match(css, /\.application-history-issuer-step-event__content time\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
});

test('existing combined event structure preserves distinct confirmation records and original timestamps', () => {
  const history = buildApplicationHistoryEntries([registration, verification]);
  assert.equal(history.length, 1);
  const step2 = history[0].issuerStepEvents;
  assert.equal(step2.verification.createdAt, verification.createdAt);
  assert.equal(step2.registration.createdAt, registration.createdAt);
});
