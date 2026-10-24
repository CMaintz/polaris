import { useCssVars } from "../../lib/hooks/css-vars";

const VARS = "--series-1,--series-2,--grid,--axis,--muted,--surface,--text,--border";

export function useChartColors() {
  const v = useCssVars(VARS);
  return {
    series1: v["--series-1"] || "#2a78d6",
    series2: v["--series-2"] || "#eb6834",
    grid: v["--grid"] || "#e1e0d9",
    axis: v["--axis"] || "#c3c2b7",
    muted: v["--muted"] || "#898781",
    surface: v["--surface"] || "#fcfcfb",
    text: v["--text"] || "#0b0b0b",
    border: v["--border"] || "#e1e0d9",
  };
}

type Colors = ReturnType<typeof useChartColors>;

export const tooltipStyle = (c: Colors) => ({
  contentStyle: {
    background: c.surface,
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    color: c.text,
  },
  labelStyle: { color: c.text, fontWeight: 600 },
});

export const axisStyle = (c: Colors) => ({
  stroke: c.axis,
  tick: { fill: c.muted, fontSize: 12 },
});

export const axisProps = (c: Colors) => ({ ...axisStyle(c), tickLine: false });
