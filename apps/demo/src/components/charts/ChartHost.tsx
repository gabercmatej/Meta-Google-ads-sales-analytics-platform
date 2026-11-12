// Shared state between a chart card, its expanded dialog and its print/PDF output:
// which series are hidden, display options, and the model of the chart currently drawn.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ChartRow, ChartSeries } from './TimeSeriesChart';

export interface ChartModel {
  data: readonly ChartRow[];
  series: readonly ChartSeries[];
  yFormat: (v: number) => string;
  ariaLabel: string;
  tooltipNote?: string;
}

export interface ChartOptions {
  grid: boolean;
  /** Draw plain line series as bars (only offered when every series is a line). */
  bars: boolean;
}

export type ChartRole = 'card' | 'dialog' | 'print';
const RoleCtx = createContext<ChartRole>('card');
export const ChartRoleScope = RoleCtx.Provider;
export const useChartRole = () => useContext(RoleCtx);

export interface ChartHostValue {
  hidden: ReadonlySet<string>;
  toggle: (key: string, total: number) => void;
  options: ChartOptions;
  /** The model each rendering of the chart (card, dialog, print sheet) last reported. */
  models: Partial<Record<ChartRole, ChartModel>>;
  report: (role: ChartRole, m: ChartModel) => void;
}

const Ctx = createContext<ChartHostValue | null>(null);
export const useChartHost = () => useContext(Ctx);

/** Cheap change signature so reporting a model never loops on fresh-but-equal arrays. */
function signature(m: ChartModel): string {
  let sum = 0;
  let n = 0;
  for (const r of m.data) for (const s of m.series) {
    const v = r[s.key];
    if (typeof v === 'number') {
      sum += v;
      n++;
    }
  }
  return `${m.data.length}|${m.data[0]?.key}|${m.data.at(-1)?.key}|${m.series.map((s) => s.key).join(',')}|${n}|${sum}`;
}

export function ChartHostProvider(props: { options: ChartOptions; hidden: ReadonlySet<string>; setHidden: (h: ReadonlySet<string>) => void; children: ReactNode }) {
  const [models, setModels] = useState<Partial<Record<ChartRole, ChartModel>>>({});
  const sig = useRef<Partial<Record<ChartRole, string>>>({});
  const report = useCallback((role: ChartRole, m: ChartModel) => {
    const next = signature(m);
    if (next === sig.current[role]) return;
    sig.current[role] = next;
    setModels((cur) => ({ ...cur, [role]: m }));
  }, []);
  const { hidden, setHidden } = props;
  const toggle = useCallback(
    (key: string, total: number) => {
      const next = new Set(hidden);
      if (next.has(key)) next.delete(key);
      else if (next.size < total - 1) next.add(key);
      setHidden(next);
    },
    [hidden, setHidden],
  );
  const value = useMemo<ChartHostValue>(() => ({ hidden, toggle, options: props.options, models, report }), [hidden, toggle, props.options, models, report]);
  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}
