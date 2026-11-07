import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../src/assets/styles/global.css', import.meta.url), 'utf8');
const loader = await readFile(new URL('../src/components/loaders/TrexLoader.jsx', import.meta.url), 'utf8');
const rule = (selector) => css.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? '';

test('the loader moves smoothly back and forth and never leaves the track', () => {
  const track = rule('\\.trex-loader__progress');
  const segment = rule('\\.trex-loader__progress span');
  const keyframes = css.match(/@keyframes trex-progress\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(track, /overflow:\s*hidden\s*;/);
  assert.match(segment, /width:\s*42%\s*;/);
  assert.match(segment, /animation:\s*trex-progress\s+1\.8s\s+ease-in-out\s+infinite\s+alternate\s*;/);
  assert.match(segment, /animation-delay:\s*var\(--trex-progress-delay,\s*0s\)\s*;/);
  assert.match(keyframes, /from\s*\{\s*transform:\s*translate3d\(0,\s*0,\s*0\)/);
  assert.match(keyframes, /to\s*\{\s*transform:\s*translate3d\(138%,\s*0,\s*0\)/);
});

test('loader remounts resume the same progress position and direction', () => {
  assert.match(loader, /const PROGRESS_LEG_DURATION_MS = 1800;/);
  assert.match(loader, /const PROGRESS_CYCLE_MS = PROGRESS_LEG_DURATION_MS \* 2;/);
  assert.match(loader, /'--trex-progress-delay': `-\$\{\(now % PROGRESS_CYCLE_MS\) \/ 1000\}s`/);
  assert.match(loader, /useState\(getAnimationPhaseStyle\)/);
  // The phase variable must be inherited by both the loader visual and bar.
  assert.match(loader, /className="trex-loader__body" style=\{animationPhaseStyle\}/);
  assert.doesNotMatch(loader, /className="trex-loader__visual" style=/);

  const cycle = 3600;
  const phase = (now) => now % cycle;
  const position = (now) => {
    const elapsed = phase(now);
    return elapsed <= 1800 ? elapsed / 1800 : 2 - elapsed / 1800;
  };
  for (const remountTime of [125, 700, 1700, 1900, 2600, 3601, 8187, 91723]) {
    // An animation that was continuously mounted and one that was freshly
    // mounted with this negative delay have the same phase at the same time.
    assert.equal(position(remountTime), position(remountTime % cycle));
  }
});

test('small screens and reduced-motion preferences are preserved', () => {
  const reduced = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.trex-loader__progress span\s*\{([\s\S]*?)\}\s*\}/)?.[1] ?? '';
  assert.match(css, /@media\s*\(max-width:\s*360px\)[\s\S]*?\.trex-loader__progress\s*\{\s*width:\s*min\(100%,\s*166px\);/);
  assert.match(reduced, /animation:\s*none\s*!important/);
  assert.match(reduced, /transform:\s*translateX\(70%\)/);
});
