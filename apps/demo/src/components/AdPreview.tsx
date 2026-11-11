// Original ad creative renderer. Everything is drawn from the ShowcaseCreative spec with
// gradients, shapes and text: no logos, no trademarks, no external or stock images.
import { useId } from 'react';
import type { CreativeTheme, CreativeVisual, ShowcaseCreative } from '@sedem-ads/analytics-core';
import './adpreview.css';

export interface AdPreviewProps {
  creative: ShowcaseCreative;
  size?: "sm" | "md";
  /** Page name shown on Meta cards (defaults to a fictional placeholder). */
  brand?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(f.slice(0, 2), 16) || 0, parseInt(f.slice(2, 4), 16) || 0, parseInt(f.slice(4, 6), 16) || 0];
}

/** Text colour that stays readable on a given background. */
function readableOn(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#111827' : '#ffffff';
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'example.com';
  }
}

/** Theme illustration drawn on a 160x100 canvas, in the accent colour with soft opacity. */
function Illustration({ theme, accent, ink }: { theme: CreativeTheme; accent: string; ink: string }) {
  const soft = { fill: accent, opacity: 0.9 };
  const line = { fill: 'none', stroke: ink, strokeWidth: 2, strokeLinecap: 'round' as const, opacity: 0.55 };
  switch (theme) {
    case 'consultation':
      return (
        <g>
          <rect x="88" y="16" width="56" height="34" rx="9" {...soft} />
          <path d="M100 50l-6 10 16-10z" {...soft} />
          <rect x="20" y="40" width="58" height="36" rx="9" fill={ink} opacity="0.2" />
          <path d="M66 76l8 9-2-9z" fill={ink} opacity="0.2" />
          <path d="M98 28h36M98 37h24" {...line} />
        </g>
      );
    case 'documents':
      return (
        <g>
          <rect x="30" y="18" width="52" height="66" rx="5" fill={ink} opacity="0.18" transform="rotate(-8 56 51)" />
          <rect x="60" y="14" width="56" height="70" rx="5" {...soft} />
          <path d="M70 30h36M70 40h36M70 50h24" {...line} />
          <circle cx="104" cy="70" r="8" fill={ink} opacity="0.3" />
        </g>
      );
    case 'family':
      return (
        <g>
          <circle cx="62" cy="34" r="11" {...soft} />
          <path d="M42 80c0-16 8-26 20-26s20 10 20 26z" {...soft} />
          <circle cx="102" cy="44" r="9" fill={ink} opacity="0.3" />
          <path d="M86 82c0-13 6-21 16-21s16 8 16 21z" fill={ink} opacity="0.3" />
          <circle cx="82" cy="58" r="6" fill={ink} opacity="0.45" />
        </g>
      );
    case 'business':
      return (
        <g>
          <rect x="34" y="52" width="20" height="30" rx="3" fill={ink} opacity="0.3" />
          <rect x="62" y="36" width="20" height="46" rx="3" {...soft} />
          <rect x="90" y="22" width="20" height="60" rx="3" fill={ink} opacity="0.3" />
          <path d="M30 28l30 4 24-16 30 6" {...line} />
        </g>
      );
    case 'chat':
      return (
        <g>
          <rect x="36" y="20" width="62" height="28" rx="10" {...soft} />
          <rect x="62" y="54" width="62" height="28" rx="10" fill={ink} opacity="0.28" />
          <circle cx="54" cy="34" r="3" fill={ink} opacity="0.7" />
          <circle cx="67" cy="34" r="3" fill={ink} opacity="0.7" />
          <circle cx="80" cy="34" r="3" fill={ink} opacity="0.7" />
        </g>
      );
    case 'deadline':
      return (
        <g>
          <circle cx="80" cy="50" r="32" {...soft} />
          <circle cx="80" cy="50" r="26" fill="none" stroke={ink} strokeWidth="2" opacity="0.35" />
          <path d="M80 50V32M80 50l14 8" {...line} strokeWidth={3} opacity={0.8} />
        </g>
      );
    case 'property':
      return (
        <g>
          <path d="M40 54l40-32 40 32z" {...soft} />
          <rect x="48" y="54" width="64" height="30" fill={ink} opacity="0.25" />
          <rect x="72" y="62" width="16" height="22" rx="2" fill={ink} opacity="0.5" />
        </g>
      );
    default:
      return (
        <g>
          <circle cx="80" cy="50" r="34" {...soft} opacity={0.35} />
          <circle cx="80" cy="50" r="22" {...soft} opacity={0.6} />
          <circle cx="80" cy="50" r="10" {...soft} />
        </g>
      );
  }
}

function Visual({ visual, playButton, ratio = '16 / 10' }: { visual: CreativeVisual; playButton?: boolean; ratio?: string }) {
  const id = useId().replace(/:/g, '');
  const ink = readableOn(visual.background);
  return (
    <div className="adp-visual" style={{ aspectRatio: ratio, color: ink }}>
      <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="adp-visual-art">
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={visual.background} />
            <stop offset="1" stopColor={visual.accent} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <rect width="160" height="100" fill={`url(#g${id})`} />
        <circle cx="150" cy="-4" r="40" fill={visual.accent} opacity="0.18" />
        <g transform="translate(18 6) scale(0.82)">
          <Illustration theme={visual.theme} accent={visual.accent} ink={ink} />
        </g>
        {playButton && (
          <g>
            <circle cx="80" cy="50" r="13" fill="#000" opacity="0.45" />
            <path d="M76 43l13 7-13 7z" fill="#fff" />
          </g>
        )}
      </svg>
      <div className="adp-visual-text">
        <strong>{visual.title}</strong>
        <span>{visual.subtitle}</span>
      </div>
    </div>
  );
}

function MetaCard({ c, brand }: { c: ShowcaseCreative; brand: string }) {
  const v = c.visual;
  const host = hostOf(c.finalUrl);
  return (
    <div className="adp-body">
      <div className="adp-meta-head">
        <span className="adp-avatar" aria-hidden="true" style={{ background: v ? `linear-gradient(135deg, ${v.background}, ${v.accent})` : '#94a3b8' }} />
        <div>
          <div className="adp-brand">{brand}</div>
          <div className="adp-sponsored">Sponsored · Demo</div>
        </div>
      </div>
      <p className="adp-text">{c.primaryText}</p>
      {v && c.format === 'carousel' ? (
        <div className="adp-carousel" aria-label="Carousel cards">
          <Visual visual={v} ratio="1 / 1" />
          <Visual visual={{ ...v, accent: v.background, background: v.accent, title: v.subtitle, subtitle: '' }} ratio="1 / 1" />
          <Visual visual={{ ...v, theme: 'brand', title: c.headline, subtitle: '' }} ratio="1 / 1" />
        </div>
      ) : (
        v && <Visual visual={v} playButton={c.format === 'video'} />
      )}
      <div className="adp-cta-row">
        <div className="adp-cta-text">
          <span className="adp-host">{host.toUpperCase()}</span>
          <strong>{c.headline}</strong>
        </div>
        <span className="adp-cta-btn">{c.callToAction}</span>
      </div>
    </div>
  );
}

function GoogleSearch({ c }: { c: ShowcaseCreative }) {
  const heads = (c.headlines.length ? c.headlines : [c.headline]).slice(0, 3);
  return (
    <div className="adp-body adp-search">
      <div className="adp-search-url">
        <span className="adp-ad-tag">Sponsored</span> {hostOf(c.finalUrl)}
      </div>
      <div className="adp-search-heads">{heads.join(' | ')}</div>
      {c.descriptions.slice(0, 2).map((d) => (
        <p className="adp-search-desc" key={d}>
          {d}
        </p>
      ))}
    </div>
  );
}

function GoogleVisual({ c }: { c: ShowcaseCreative }) {
  const v = c.visual;
  const isPmax = c.format === 'pmax_asset_group';
  return (
    <div className="adp-body">
      <div className="adp-search-url">
        <span className="adp-ad-tag">Ad</span> {hostOf(c.finalUrl)}
        {isPmax && <span className="adp-chip">Asset group</span>}
      </div>
      {v && isPmax ? (
        <div className="adp-pmax">
          <Visual visual={v} ratio="1 / 1" />
          <div className="adp-pmax-side">
            <Visual visual={{ ...v, theme: 'brand', title: '', subtitle: '' }} ratio="16 / 10" />
            <Visual visual={{ ...v, accent: v.background, background: v.accent, title: '', subtitle: '' }} ratio="16 / 10" />
          </div>
        </div>
      ) : (
        v && <Visual visual={v} />
      )}
      <div className="adp-search-heads">{c.headline}</div>
      <p className="adp-search-desc">{c.descriptions[0] ?? c.primaryText}</p>
      <span className="adp-cta-btn adp-cta-inline">{c.callToAction}</span>
    </div>
  );
}

export function AdPreview({ creative, size = "md", brand = "Demo Company" }: AdPreviewProps) {
  const label = `${creative.platform === 'meta' ? 'Meta' : 'Google'} ${creative.format.replace(/_/g, ' ')} ad preview: ${creative.headline}`;
  let body;
  if (creative.platform === 'meta') body = <MetaCard c={creative} brand={brand} />;
  else if (creative.format === 'responsive_search') body = <GoogleSearch c={creative} />;
  else body = <GoogleVisual c={creative} />;
  return (
    <div className={`adp adp-${size} adp-${creative.platform}`} role="img" aria-label={label}>
      {body}
      <div className="adp-foot">Illustrative preview · Demo</div>
    </div>
  );
}
