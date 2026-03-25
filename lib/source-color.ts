/**
 * Stabiele, toegankelijke accentkleur per bron-id (scheduler source of vergelijkbaar).
 * Zelfde id → zelfde hue over de hele app.
 */
export function sourceHueFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export function sourceColorCss(id: string): {
  border: string;
  bgLight: string;
  bgDark: string;
  textLight: string;
  textDark: string;
} {
  const h = sourceHueFromId(id);
  return {
    border: `hsl(${h} 58% 42%)`,
    bgLight: `hsl(${h} 42% 94%)`,
    bgDark: `hsl(${h} 28% 22%)`,
    textLight: `hsl(${h} 50% 22%)`,
    textDark: `hsl(${h} 45% 92%)`,
  };
}
