import tinycolor from "tinycolor2";

export function buildArtworkToneMatrix(accent: string): number[] {
  const tone = tinycolor(accent).toHsl();
  const rgb = tinycolor({ ...tone, l: 0.58 }).toRgb();
  // Map luminance to the profile hue, retaining the source artwork's facets and alpha.
  return [rgb.r, rgb.g, rgb.b]
    .flatMap((channel) => {
      const gain = (channel / 255) * 1.25;
      return [0.2126 * gain, 0.7152 * gain, 0.0722 * gain, 0, 0];
    })
    .concat([0, 0, 0, 1, 0]);
}
