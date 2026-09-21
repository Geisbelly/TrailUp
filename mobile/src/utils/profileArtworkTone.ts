import tinycolor from "tinycolor2";

export function buildArtworkToneMatrix(accent: string): number[] {
  const tone = tinycolor(accent).toHsl();
  if (tone.s === 0 && tone.l > 0.95) {
    // Silver-white: retain relief and dark facets, with soft highlights instead of flat white.
    return [0, 1, 2].flatMap(() => [0.2126 * 0.66, 0.7152 * 0.66, 0.0722 * 0.66, 0, 0.26])
      .concat([0, 0, 0, 1, 0]);
  }
  const rgb = tinycolor({ ...tone, l: 0.68 }).toRgb();
  // Map luminance to the profile hue, retaining the source artwork's facets and alpha.
  return [rgb.r, rgb.g, rgb.b]
    .flatMap((channel) => {
      const gain = (channel / 255) * 1.05;
      return [0.2126 * gain, 0.7152 * gain, 0.0722 * gain, 0, (channel / 255) * 0.2];
    })
    .concat([0, 0, 0, 1, 0]);
}
