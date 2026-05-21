/**
 * Mobile design tokens — JS mirror of the Notion-inspired @theme block
 * in src/web/app/globals.css. React Native cannot consume CSS custom
 * properties, so we maintain a parallel set here. Values match web 1:1;
 * when web tokens change, mobile follows in the same PR.
 *
 * See ADR-0008 (web-primary aesthetic) and ADR-0009 mobile amendment
 * (Conversational Intelligence on mobile uses the same design language).
 */

export const colors = {
  // Surfaces
  bg: "#ffffff",
  surface: "#f7f6f3",
  surface2: "#f1f1ef",
  hover: "#ebebea",
  active: "#e3e2df",

  // Foreground
  fg: "#37352f",
  fgMuted: "#6f6e69",
  fgSubtle: "#91918e",
  fgOnAccent: "#ffffff",

  // Borders + dividers
  border: "#efeeec",
  borderStrong: "#d3d2cf",
  divider: "#f3f2f0",

  // Accent / interactive
  accent: "#2383e2",
  accentHover: "#1f78cf",
  accentSubtle: "#eaf3fb",

  // Semantic / status
  success: "#0f7c4a",
  successSubtle: "#e5f4ec",
  warning: "#b06d00",
  warningSubtle: "#fbf2e0",
  danger: "#b91c1c",
  dangerSubtle: "#fbe6e6",
  info: "#2383e2",
  infoSubtle: "#eaf3fb",
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const motion = {
  fast: 90,
  base: 140,
  slow: 220,
} as const;

export const fontSizes = {
  display: 32,
  h1: 24,
  h2: 18,
  h3: 14,
  body: 14,
  small: 13,
  micro: 11,
} as const;

export const lineHeights = {
  display: 40,
  h1: 32,
  h2: 26,
  h3: 20,
  body: 22,
  small: 20,
  micro: 16,
} as const;

/**
 * Default sans family. Mobile loads `InterTight` via expo-google-fonts
 * for now; future work may swap to `Outfit` (the web pair) once
 * loadable on Expo. Keep the field name `sans` so callers don't pin to
 * a family name.
 */
export const fonts = {
  sans: "InterTight_400Regular",
  sansMedium: "InterTight_700Bold",
  sansBold: "InterTight_900Black",
  mono: "Menlo",
} as const;
