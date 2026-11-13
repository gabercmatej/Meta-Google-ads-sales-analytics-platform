// "Save PDF" for an expanded chart. jsPDF and svg2pdf.js are imported dynamically so they load only
// when someone saves a PDF (they are not part of the initial bundle). Everything is built in the
// browser from the chart's own SVG; built-in Helvetica only, no font or network request.

export interface PdfSeries {
  label: string;
  color: string;
}

export interface PdfInput {
  title: string;
  /** ISO dates of the period; used in the file name and the header. */
  from: string;
  to: string;
  periodText: string;
  scope: string;
  granularity: 'Daily' | 'Weekly' | 'Monthly';
  headline?: string;
  howCalculated: string;
  series: readonly PdfSeries[];
  /** Table rows: first cell is the period label, then one formatted value per series. */
  rows: readonly (readonly string[])[];
  /** The rendered recharts SVG (live element); cloned, never modified. */
  svg: SVGSVGElement | null;
}

export function pdfFileName(title: string, from: string, to: string): string {
  const safe = title.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Chart';
  return `Sedem-Ads-${safe}-${from}-${to}.pdf`;
}

/** Built-in Helvetica covers WinAnsi only: map the few symbols the demo uses to ASCII. */
export function pdfText(s: string): string {
  return s
    .replace(/€\s?(-?[\d.,]+[A-Za-z]?)/g, '$1 EUR')
    .replace(/€/g, 'EUR ')
    .replace(/[−–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ | /g, ' ')
    .replace(/[^\x20-\x7E -ÿ]/g, '');
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [31, 41, 55];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Clone of the chart SVG with solid 2–3 px lines and the built-in PDF font, attached off-screen for svg2pdf. */
function prepareSvg(svg: SVGSVGElement): { el: SVGSVGElement; width: number; height: number; dispose: () => void } {
  const el = svg.cloneNode(true) as SVGSVGElement;
  const rect = svg.getBoundingClientRect();
  const width = Number(svg.getAttribute('width')) || rect.width || 900;
  const height = Number(svg.getAttribute('height')) || rect.height || 300;
  el.setAttribute('width', String(width));
  el.setAttribute('height', String(height));
  el.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  el.querySelectorAll('[stroke-dasharray]').forEach((n) => n.removeAttribute('stroke-dasharray'));
  el.querySelectorAll('.recharts-line-curve, .recharts-area-curve').forEach((n) => {
    const w = Number(n.getAttribute('stroke-width')) || 2.5;
    n.setAttribute('stroke-width', String(Math.min(3, Math.max(2, w))));
    n.setAttribute('stroke-dasharray', 'none');
  });
  el.querySelectorAll('text, tspan').forEach((n) => n.setAttribute('font-family', 'Helvetica'));
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;';
  holder.appendChild(el);
  document.body.appendChild(holder);
  return { el, width, height, dispose: () => holder.remove() };
}

export async function buildChartPdf(input: PdfInput): Promise<{ blob: Blob; fileName: string }> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297;
  const H = 210;
  const M = 12;
  const footer = (page: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Synthetic demo data', M, H - 7);
    doc.text(`Page ${page}`, W - M, H - 7, { align: 'right' });
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(17, 24, 39);
  doc.text(pdfText(input.title), M, M + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(75, 85, 99);
  doc.text(pdfText(`${input.periodText} | ${input.scope} | ${input.granularity}`), M, M + 12.5);
  if (input.headline) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text(pdfText(input.headline), M, M + 18.5);
  }

  // Legend: a solid line sample plus the label.
  let lx = M;
  let ly = M + 26;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setLineWidth(0.8);
  for (const s of input.series) {
    const label = pdfText(s.label);
    const w = 9 + doc.getTextWidth(label) + 5;
    if (lx + w > W - M) {
      lx = M;
      ly += 5.5;
    }
    const [r, g, b] = hexToRgb(s.color);
    doc.setDrawColor(r, g, b);
    doc.line(lx, ly - 1, lx + 7, ly - 1);
    doc.setTextColor(31, 41, 55);
    doc.text(label, lx + 9, ly);
    lx += w;
  }

  // Chart as vector graphics.
  const chartTop = ly + 5;
  const chartH = H - 24 - chartTop - 22;
  if (input.svg) {
    const prep = prepareSvg(input.svg);
    try {
      const boxW = W - 2 * M;
      const scale = Math.min(boxW / prep.width, chartH / prep.height);
      await svg2pdf(prep.el, doc, { x: M, y: chartTop, width: prep.width * scale, height: prep.height * scale });
    } finally {
      prep.dispose();
    }
  }

  // How it is calculated.
  doc.setFontSize(8.5);
  doc.setTextColor(75, 85, 99);
  const lines = doc.splitTextToSize(pdfText(`How it is calculated: ${input.howCalculated}`), W - 2 * M) as string[];
  doc.text(lines.slice(0, 4), M, H - 24);
  footer(1);

  // Values table, paginated.
  const cols = input.series.length + 1;
  const firstW = 30;
  const colW = (W - 2 * M - firstW) / Math.max(1, cols - 1);
  const rowH = 5;
  let page = 1;
  let y = 0;
  const header = () => {
    doc.addPage('a4', 'landscape');
    page++;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    doc.text(pdfText(`${input.title} | values`), M, M + 5);
    doc.setFontSize(8);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    y = M + 13;
    doc.text(input.granularity === 'Daily' ? 'Day' : input.granularity === 'Weekly' ? 'Week' : 'Month', M, y);
    input.series.forEach((s, i) => {
      const label = pdfText(s.label);
      doc.text(label.length > 26 ? `${label.slice(0, 25)}.` : label, M + firstW + colW * (i + 1) - 1, y, { align: 'right' });
    });
    doc.line(M, y + 1.5, W - M, y + 1.5);
    y += 6;
    doc.setFont('helvetica', 'normal');
  };
  if (input.rows.length > 0) {
    header();
    for (const row of input.rows) {
      if (y > H - 16) {
        footer(page);
        header();
      }
      doc.setTextColor(31, 41, 55);
      doc.text(pdfText(row[0] ?? ''), M, y);
      for (let i = 1; i < row.length; i++) doc.text(pdfText(row[i] ?? ''), M + firstW + colW * i - 1, y, { align: 'right' });
      y += rowH;
    }
    footer(page);
  }

  const fileName = pdfFileName(input.title, input.from, input.to);
  return { blob: doc.output('blob') as Blob, fileName };
}

/** Builds the PDF and saves it through a Blob + anchor download (no network). */
export async function saveChartPdf(input: PdfInput): Promise<string> {
  const { blob, fileName } = await buildChartPdf(input);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fileName;
}
