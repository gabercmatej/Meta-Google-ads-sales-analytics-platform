import { NO_DATA } from '../../lib/format';
import type { ChartModel } from './ChartHost';

export const DEFAULT_HOW_CALCULATED =
  'Daily and monthly views use the same data: a month is the sum of its days. Ratios (CTR, CPC, CPL, ROAS) are computed from summed numerators and denominators, never averaged from daily ratios. A day without data is a gap, not zero.';

/** One row per period: label plus the formatted value of every visible series (missing = "–"). */
export function valueRows(model: ChartModel, hidden: ReadonlySet<string>): { head: string[]; rows: string[][]; colors: string[] } {
  const series = model.series.filter((s) => !hidden.has(s.key));
  return {
    head: series.map((s) => s.label),
    colors: series.map((s) => s.color),
    rows: model.data.map((d) => [
      /^\d{4}-\d{2}-\d{2}$/.test(d.key) ? d.key : d.label,
      ...series.map((s) => {
        const v = d[s.key];
        return typeof v === 'number' && Number.isFinite(v) ? (s.format ?? model.yFormat)(v) : NO_DATA;
      }),
    ]),
  };
}

export function ValuesTable(props: { model: ChartModel; hidden: ReadonlySet<string>; periodHead: string; className?: string }) {
  const { head, rows, colors } = valueRows(props.model, props.hidden);
  return (
    <div className={props.className} data-testid="chart-values">
      <table className="w-full border-collapse text-xs tabular">
        <caption className="sr-only">Chart values by {props.periodHead.toLowerCase()}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky top-0 bg-white px-3 py-1.5 text-left font-medium text-ink-3">
              {props.periodHead}
            </th>
            {head.map((h, i) => (
              <th key={h} scope="col" className="sticky top-0 whitespace-nowrap bg-white px-3 py-1.5 text-right font-medium text-ink-3">
                <span className="mr-1.5 inline-block h-0.5 w-3 align-middle" style={{ background: colors[i] }} aria-hidden="true" />
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-line">
              <th scope="row" className="whitespace-nowrap px-3 py-1 text-left font-medium text-ink-2">
                {r[0]}
              </th>
              {r.slice(1).map((c, i) => (
                <td key={i} className={`whitespace-nowrap px-3 py-1 text-right ${c === NO_DATA ? 'text-ink-3' : 'text-ink'}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
