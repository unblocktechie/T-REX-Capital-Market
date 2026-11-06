import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../src/assets/styles/global.css', import.meta.url), 'utf8');

test('loader brand owns a full row so the status label cannot sit beside the logo', () => {
  const brandRule = css.match(/\.trex-loader__brand\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  assert.match(brandRule, /display:\s*flex\s*;/);
  assert.match(brandRule, /width:\s*100%\s*;/);
  assert.doesNotMatch(brandRule, /display:\s*inline-flex\s*;/);
});

test('small-screen loader keeps the brand and status centered', () => {
  assert.match(
    css,
    /@media\s*\(max-width:\s*560px\)[\s\S]*?\.trex-loader__brand,\s*\n\s*\.trex-loader__eyebrow,[\s\S]*?justify-content:\s*center\s*;/,
  );
});
