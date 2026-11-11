import type { ReactNode } from 'react';
import { change as fmtChange } from '../lib/format';
import { Value } from './ui';
import './kpi.css';

export interface KpiCardProps {
  label: string;
  /** Pre-formatted value ("–" renders as no data). */
  value: string;
  /** Relative change vs the previous equal-length period (fraction), or null. */
  change?: number | null;
  /** For cost metrics a decrease is good. */
  lowerIsBetter?: boolean;
  sub?: ReactNode;
  noDataReason?: string;
  changeNote?: string;
  onClick?: () => void;
  tone?: 'default' | 'negative';
}

export function KpiCard(props: KpiCardProps) {
  const c = props.change ?? null;
  const good = c === null || c === 0 ? null : props.lowerIsBetter ? c < 0 : c > 0;
  const body = (
    <>
      <span className="kpi-label">{props.label}</span>
      <span className={`kpi-value num ${props.tone === 'negative' ? 'neg' : ''}`}>
        <Value text={props.value} reason={props.noDataReason} />
      </span>
      <span className={`kpi-change num ${good === null ? '' : good ? 'up' : 'down'}`} title={props.changeNote ?? 'Change vs previous equal-length period'}>
        {c === null ? <span className="no-data">– vs previous</span> : <>{c > 0 ? '▲' : c < 0 ? '▼' : '■'} {fmtChange(c)} <span className="kpi-vs">vs previous</span></>}
      </span>
      {props.sub && <span className="kpi-sub">{props.sub}</span>}
    </>
  );
  if (props.onClick) {
    return (
      <button type="button" className="kpi kpi-click" onClick={props.onClick} aria-label={`${props.label}: ${props.value}. Open chart`}>
        {body}
      </button>
    );
  }
  return <div className="kpi">{body}</div>;
}
