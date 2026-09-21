import assert from 'node:assert/strict';
import test from 'node:test';
import tinycolor from 'tinycolor2';
import { Design } from '../styles/design';
import { buildProfileShellPaletteFromAccent } from './profileShellPalette';

const colors = ['#17a398', '#4e5a66', '#d7263d', '#5b3fd9', '#1e4fd6', '#f4623a', '#c9a227'];

for (const color of colors) {
  test(`all shell surfaces follow the profile hue ${color}`, () => {
    const palette = buildProfileShellPaletteFromAccent(color);
    const hue = tinycolor(color).toHsl().h;
    for (const key of ['background', 'surface', 'surfaceElevated', 'border', 'borderStrong', 'progressTrack'] as const) {
      const actual = tinycolor(palette[key]).toHsl().h;
      const distance = Math.abs(actual - hue);
      // Dark near-neutral RGB values lose a few hue degrees through 8-bit rounding.
      assert.ok(Math.min(distance, 360 - distance) < 5, `${key}: ${palette[key]} does not follow ${color}`);
    }
  });

  test(`profile ${color} keeps readable text and accents`, () => {
    const palette = buildProfileShellPaletteFromAccent(color);
    for (const background of [palette.background, palette.surface, palette.surfaceElevated]) {
      assert.ok(tinycolor.readability(background, palette.accent) >= 4.5);
      assert.ok(tinycolor.readability(background, palette.text) >= 7);
    }
  });
}

test('public accent retains purple identity', () => {
  const palette = buildProfileShellPaletteFromAccent(Design.primary, 'magica');
  assert.ok(Math.abs(tinycolor(palette.background).toHsl().h - tinycolor(Design.primary).toHsl().h) < 3);
});

test('missing and invalid accents produce a valid neutral fallback', () => {
  assert.deepEqual(buildProfileShellPaletteFromAccent('invalid'), buildProfileShellPaletteFromAccent());
  for (const key of ['background', 'surface', 'accent'] as const) {
    assert.ok(tinycolor(buildProfileShellPaletteFromAccent()[key]).isValid());
  }
});
