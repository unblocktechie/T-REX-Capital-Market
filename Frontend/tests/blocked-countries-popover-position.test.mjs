import assert from 'node:assert/strict';
import test from 'node:test';
import { blockedCountriesPopoverPosition } from '../src/utils/blockedCountriesPopover.js';

const viewportWidth = 1648;
const viewportHeight = 898;
const anchor = { top: 793, bottom: 816, left: 1430, right: 1504 };

test('short country list opens immediately above trigger when there is no room below', () => {
  const placement = blockedCountriesPopoverPosition({
    anchor,
    viewportWidth,
    viewportHeight,
    contentHeight: 104,
  });
  assert.equal(placement.maxHeight, 360);
  assert.equal(placement.top, anchor.top - 8 - 104);
  assert.equal(placement.left + placement.width, anchor.right);
  assert.ok(placement.top >= 12);
});

test('country list opens immediately below trigger when there is sufficient room', () => {
  const placement = blockedCountriesPopoverPosition({
    anchor: { ...anchor, top: 340, bottom: 363 },
    viewportWidth,
    viewportHeight,
    contentHeight: 104,
  });
  assert.equal(placement.top, 371);
});

test('long country list uses its capped height and stays inside the viewport', () => {
  const placement = blockedCountriesPopoverPosition({
    anchor,
    viewportWidth,
    viewportHeight,
    contentHeight: 40000,
  });
  assert.equal(placement.maxHeight, 360);
  assert.equal(placement.top, anchor.top - 8 - 360);
  assert.ok(placement.top + placement.maxHeight < anchor.top);
});

test('narrow viewports keep popup fully in bounds', () => {
  const placement = blockedCountriesPopoverPosition({
    anchor: { top: 420, bottom: 442, left: 255, right: 310 },
    viewportWidth: 335,
    viewportHeight: 570,
    contentHeight: 150,
  });
  assert.equal(placement.width, 311);
  assert.ok(placement.left >= 12);
  assert.ok(placement.left + placement.width <= 323);
  assert.ok(placement.top >= 12);
  assert.ok(placement.top + Math.min(placement.maxHeight, 150) <= 558);
});

test('oversized lists scroll within available space when neither side can fit', () => {
  const placement = blockedCountriesPopoverPosition({
    anchor: { top: 210, bottom: 240, left: 450, right: 500 },
    viewportWidth: 800,
    viewportHeight: 510,
    contentHeight: 3000,
  });
  assert.equal(placement.top, 248);
  assert.equal(placement.maxHeight, 250);
});
