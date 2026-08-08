/**
 * The design tokens the charts draw with.
 *
 * Recharts could be handed `var(--accent)` directly because it renders SVG;
 * Chart.js paints to a canvas and needs a resolved colour. These are read from
 * the computed root style on mount and re-read when the OS colour scheme
 * flips, which is how the charts keep following the light/dark theme.
 */
const FALLBACK = {
  accent: "#2f6df6",
  positive: "#167c50",
  warning: "#9a6200",
  danger: "#b3261e",
  muted: "#5c6675",
  border: "#e3e6ec",
  surface: "#ffffff",
  foreground: "#14181f",
  surfaceMuted: "#f2f4f7",
};

export type ChartTokens = typeof FALLBACK;

const VARS: Record<keyof ChartTokens, string> = {
  accent: "--accent",
  positive: "--positive",
  warning: "--warning",
  danger: "--danger",
  muted: "--muted",
  border: "--border",
  surface: "--surface",
  foreground: "--foreground",
  surfaceMuted: "--surface-muted",
};

export function useChartTokens() {
  const tokens = ref<ChartTokens>({ ...FALLBACK });

  function read() {
    if (typeof window === "undefined") return;
    const style = getComputedStyle(document.documentElement);
    const next = { ...FALLBACK };
    for (const key of Object.keys(VARS) as (keyof ChartTokens)[]) {
      const value = style.getPropertyValue(VARS[key]).trim();
      if (value) next[key] = value;
    }
    tokens.value = next;
  }

  onMounted(() => {
    read();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", read);
    onBeforeUnmount(() => media.removeEventListener("change", read));
  });

  return tokens;
}
