/**
 * Utilitaires sécurisés d'export CSV et de filtrage temporel des livraisons.
 * Protège contre l'injection de formules CSV (Excel / Google Sheets / LibreOffice)
 * et assure un encodage UTF-8 avec BOM pour les caractères français.
 */

export function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  // Neutraliser toute cellule commençant par =, +, -, @, \t ou \r (même après espaces)
  const trimmedLeading = raw.replace(/^ +/, '');
  const isFormulaRisk =
    trimmedLeading.length > 0 &&
    ['=', '+', '-', '@', '\t', '\r'].includes(trimmedLeading[0]);
  const safe = isFormulaRisk ? `'${raw}` : raw;
  const escaped = safe.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function buildCsvContent(
  headers: string[],
  rows: Array<Array<unknown>>
): string {
  const headerLine = headers.map(escapeCsvCell).join(';');
  const bodyLines = rows.map((row) => row.map(escapeCsvCell).join(';'));
  return '\uFEFF' + [headerLine, ...bodyLines].join('\r\n');
}

export function downloadCsvFile(
  filename: string,
  headers: string[],
  rows: Array<Array<unknown>>
): void {
  const csvContent = buildCsvContent(headers, rows);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type DeliveryTimeframeFilter =
  | 'today'
  | '7days'
  | 'week'
  | 'month'
  | 'year'
  | 'all';

function getBeninDayParts(date: Date): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Porto-Novo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const formatted = formatter.format(date); // YYYY-MM-DD
  const [y, m, d] = formatted.split('-').map(Number);
  return { year: y, month: m, day: d };
}

export function parseDeliveryTimestamp(rawDate?: string | number | null): number | null {
  if (!rawDate) return null;
  if (typeof rawDate === 'number' && Number.isFinite(rawDate)) return rawDate;
  const str = String(rawDate).trim();
  if (!str) return null;
  const normalized = str.toLowerCase();
  const now = new Date();
  if (normalized.startsWith("aujourd'hui") || normalized.startsWith('today')) {
    return now.getTime();
  }
  if (normalized.startsWith('hier') || normalized.startsWith('yesterday')) {
    return now.getTime() - 24 * 60 * 60 * 1000;
  }
  // Format FR DD/MM/YYYY
  const frMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (frMatch) {
    const day = Number(frMatch[1]);
    const month = Number(frMatch[2]) - 1;
    const year = Number(frMatch[3]);
    const hour = frMatch[4] ? Number(frMatch[4]) : 12;
    const min = frMatch[5] ? Number(frMatch[5]) : 0;
    const d = new Date(year, month, day, hour, min);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  const parsed = Date.parse(str);
  return Number.isNaN(parsed) ? null : parsed;
}

export function filterItemsByTimeframe<
  T extends { createdAt?: string; createdAtMs?: number; date?: string }
>(items: T[], timeframe: DeliveryTimeframeFilter, nowMs = Date.now()): T[] {
  if (timeframe === 'all') return items;

  const nowDate = new Date(nowMs);
  const nowBenin = getBeninDayParts(nowDate);
  const oneDayMs = 24 * 60 * 60 * 1000;

  return items.filter((item) => {
    const ts =
      typeof item.createdAtMs === 'number' && Number.isFinite(item.createdAtMs)
        ? item.createdAtMs
        : parseDeliveryTimestamp(item.createdAt || item.date);

    if (ts === null) {
      // Conserver si date non parsable uniquement sur les fenêtres larges
      return timeframe === 'month' || timeframe === 'year';
    }

    if (timeframe === 'today') {
      const itemBenin = getBeninDayParts(new Date(ts));
      return (
        itemBenin.year === nowBenin.year &&
        itemBenin.month === nowBenin.month &&
        itemBenin.day === nowBenin.day
      );
    }

    if (timeframe === '7days' || timeframe === 'week') {
      return nowMs - ts <= 7 * oneDayMs && ts <= nowMs + oneDayMs;
    }

    if (timeframe === 'month') {
      const itemBenin = getBeninDayParts(new Date(ts));
      return itemBenin.year === nowBenin.year && itemBenin.month === nowBenin.month;
    }

    if (timeframe === 'year') {
      const itemBenin = getBeninDayParts(new Date(ts));
      return itemBenin.year === nowBenin.year;
    }

    return true;
  });
}
