import test from 'node:test';
import assert from 'node:assert/strict';
import { colorScale, hasMissingData, missingColor, palettes } from '../src/viewer.js';

test('four color maps use their own colors', () => {
  assert.equal(Object.keys(palettes).length, 4);
  for (const name of Object.keys(palettes)) {
    const scale = colorScale({ a: 0, b: 100 }, '', name);
    assert.equal(scale.color(0), palettes[name][0]);
    assert.equal(scale.color(100), palettes[name][4]);
    assert.equal(scale.color(null), missingColor);
  }
});

test('missing legend depends on the displayed regions and selected metric', () => {
  const features = ['a', 'b'].map(code => ({ properties: { code } }));
  assert.equal(hasMissingData(features, { a: 1, b: 2 }), false);
  assert.equal(hasMissingData(features, { a: 1 }), true);
  assert.equal(hasMissingData(features, { a: 1, b: null }), true);
  assert.equal(hasMissingData(features.slice(0, 1), { a: 1, b: null }), false);
});
