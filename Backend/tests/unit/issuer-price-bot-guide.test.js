const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Wallet, Signature, verifyTypedData } = require('ethers');
const { TYPES } = require('../../src/services/token-price-update.service');

const guide = fs.readFileSync(path.join(__dirname, '../../docs/ISSUER-PRICE-BOT-GUIDE.md'), 'utf8');
const code = [...guide.matchAll(/```javascript\r?\n([\s\S]*?)```/g)]
  .map((m) => m[1]).find((block) => block.includes("import 'dotenv/config'"));

test('documented copy-paste bot is valid Node.js module syntax and contains no private chain selectors', () => {
  assert.ok(code);
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: code, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(guide, /X-Chain-Uid|chainUid/);
});

test('documented bot signs correctly, retries lost submit response unchanged, handles 429 and confirms', async () => {
  const wallet = Wallet.createRandom();
  const token = Wallet.createRandom().address;
  const controller = Wallet.createRandom().address;
  const typedData = { domain: { name: 'Test', version: '1', chainId: 11155111, verifyingContract: controller },
    types: TYPES, message: { token, newPrice: '1500000', nonce: '7', deadline: Math.floor(Date.now() / 1000) + 600 } };
  const files = new Map();
  const output = [];
  let submitBody;
  let submits = 0;
  let polls = 0;
  const fakeProcess = { env: { API_BASE_URL: 'https://api.example.com', ISSUER_API_KEY: 'test-only-key',
    CHAIN_ID: '11155111', PRICE: '1.5', SERVICE_WALLET_PRIVATE_KEY: wallet.privateKey } };
  const response = (data, status = 200) => ({ ok: status < 400, status,
    headers: { get: () => '1' }, json: async () => ({ success: status < 400, data }) });
  const fetch = async (url, options) => {
    assert.equal(options.headers['X-Chain-Id'], '11155111');
    assert.equal(options.headers.Authorization, 'Bearer test-only-key');
    if (url.endsWith('/prepare')) return response({ typedData, serviceWalletAddress: wallet.address, tokenAddress: token, chainId: 11155111 });
    if (options.method === 'POST') {
      assert.ok(files.has('.price-update-state.json'), 'save before sending');
      if (submitBody) assert.equal(options.body, submitBody);
      submitBody = options.body;
      const body = JSON.parse(submitBody);
      assert.equal(verifyTypedData(typedData.domain, TYPES, typedData.message, Signature.from({ v: body.v, r: body.r, s: body.s })), wallet.address);
      assert.equal(body.tokenAddress, token);
      assert.equal(body.newPriceRaw, typedData.message.newPrice);
      submits++;
      if (submits === 1) throw new Error('Lost HTTP response');
      return response({ priceUpdateUid: 'test-reference', status: 'SUBMITTED' }, 202);
    }
    assert.ok(url.endsWith('/test-reference'));
    polls++;
    if (polls === 1) return response(null, 429);
    return response({ status: polls === 2 ? 'SUBMITTED' : 'CONFIRMED', newPriceFormatted: '1.5', transactionHash: 'test-hash' });
  };
  const source = code.replace(/^import .*;\r?\n/gm, '').replace('main().catch', 'return main().catch');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('Wallet', 'Signature', 'readFile', 'writeFile', 'rename', 'unlink', 'process', 'console', 'fetch', 'setTimeout', source)(
    Wallet, Signature,
    async (file) => { if (!files.has(file)) throw Object.assign(new Error(), { code: 'ENOENT' }); return files.get(file); },
    async (file, value) => files.set(file, value),
    async (from, to) => { files.set(to, files.get(from)); files.delete(from); },
    async (file) => files.delete(file), fakeProcess,
    { log: (text) => output.push(text), error: (text) => output.push(text) }, fetch, (callback) => callback(),
  );
  assert.equal(fakeProcess.exitCode, undefined, output.join('\n'));
  assert.equal(submits, 2);
  assert.equal(polls, 3);
  assert.equal(files.size, 0);
  assert.match(output.join('\n'), /Price 1.5 confirmed/);
  assert.equal(output.join('\n').includes(wallet.privateKey), false);
});
