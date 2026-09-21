import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import test from "node:test";
import tinycolor from "tinycolor2";
import { buildArtworkToneMatrix } from "./profileArtworkTone";

test("native artwork is rebuilt when its profile color changes", () => {
  const source = readFileSync(
    new URL("../components/ProfileArtwork.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /<Svg\s+key=\{accent\}/);
  assert.notDeepEqual(
    buildArtworkToneMatrix("#5b3fd9"),
    buildArtworkToneMatrix("#1e4fd6"),
  );
});

function pixel(matrix: number[], channels: number[]) {
  return [0, 1, 2, 3].map((row) =>
    matrix
      .slice(row * 5, row * 5 + 4)
      .reduce(
        (sum, value, index) => sum + value * channels[index],
        matrix[row * 5 + 4],
      ),
  );
}
test("silver-white shared artwork preserves relief, restrained highlights and transparent edges", () => {
  const matrix = buildArtworkToneMatrix("#ffffff");
  const shadow = pixel(matrix, [0.05, 0.05, 0.05, 0.5]);
  const highlight = pixel(matrix, [1, 1, 1, 1]);
  assert.equal(shadow[3], 0.5);
  assert.equal(pixel(matrix, [0, 0, 0, 0])[3], 0);
  assert.ok(shadow[0] < 0.4);
  assert.equal(shadow[0], shadow[1]);
  assert.equal(shadow[1], shadow[2]);
  assert.ok(highlight[0] > shadow[0]);
  assert.ok(highlight[0] - shadow[0] > 0.6);
  assert.ok(highlight[0] < 0.95);
  const mid = pixel(matrix, [0.5, 0.5, 0.5, 1]);
  assert.ok(tinycolor.readability(tinycolor({ r: mid[0] * 255, g: mid[1] * 255, b: mid[2] * 255 }), "#11131d") >= 4.5);
});
test("artwork recoloring preserves alpha and faceted lightness differences", () => {
  const matrix = buildArtworkToneMatrix("#5b3fd9");
  assert.equal(matrix.length, 20);
  assert.equal(pixel(matrix, [1, 0.7, 0.2, 0.4])[3], 0.4);
  assert.equal(pixel(matrix, [0, 0, 0, 0])[3], 0);
  const shadow = pixel(matrix, [0.1, 0.1, 0.1, 1]);
  const highlight = pixel(matrix, [0.8, 0.8, 0.8, 1]);
  assert.ok(
    highlight.slice(0, 3).every((channel, index) => channel > shadow[index]),
  );
});
test("all seven profile hues replace the original gold hue", () => {
  for (const color of [
    "#17a398",
    "#4e5a66",
    "#d7263d",
    "#5b3fd9",
    "#1e4fd6",
    "#f4623a",
    "#c9a227",
  ]) {
    const [r, g, b] = pixel(buildArtworkToneMatrix(color), [0.7, 0.5, 0.15, 1]);
    const actual = tinycolor({ r: r * 255, g: g * 255, b: b * 255 }).toHsl().h;
    const expected = tinycolor(color).toHsl().h;
    const delta = Math.abs(actual - expected);
    assert.ok(
      Math.min(delta, 360 - delta) < 3,
      `${color} retains its profile hue`,
    );
  }
});
