export type Rgb = readonly [red: number, green: number, blue: number];

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function parseHexColor(hex: string): Rgb {
  const match = HEX_COLOR.exec(hex.trim());
  if (!match?.[1]) {
    throw new Error(`Expected a hex colour such as #1a2b3c, received "${hex}"`);
  }

  const digits = match[1].length === 3 ? match[1].replace(/./g, '$&$&') : match[1];

  return [
    Number.parseInt(digits.slice(0, 2), 16),
    Number.parseInt(digits.slice(2, 4), 16),
    Number.parseInt(digits.slice(4, 6), 16),
  ];
}

function channelLuminance(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance as defined by WCAG 2.2. */
export function relativeLuminance([red, green, blue]: Rgb): number {
  return (
    0.2126 * channelLuminance(red) +
    0.7152 * channelLuminance(green) +
    0.0722 * channelLuminance(blue)
  );
}

export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(parseHexColor(foreground));
  const second = relativeLuminance(parseHexColor(background));
  const [lighter, darker] = first > second ? [first, second] : [second, first];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Minimum ratios from WCAG 2.2 success criteria 1.4.3 and 1.4.11. */
export const WCAG_AA = {
  text: 4.5,
  largeText: 3,
  nonText: 3,
} as const;
