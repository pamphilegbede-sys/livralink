import { DeliveryOrder } from '../types';

export interface VendorPdfReportInput {
  storeName: string;
  timeRangeLabel: string;
  totalOrders: number;
  deliveredOrders: number;
  deliverySuccessRate: number;
  totalCODCollected: number;
  totalDeliveryFees: number;
  deliveries: DeliveryOrder[];
  generatedAt?: Date;
}

const WINANSI_MAP: Record<number, number> = {
  0x20ac: 0x80, // €
  0x2018: 0x91, // ‘
  0x2019: 0x92, // ’
  0x201c: 0x93, // “
  0x201d: 0x94, // ”
  0x2022: 0x95, // •
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x0152: 0x8c, // Œ
  0x0153: 0x9c, // œ
  0x0178: 0x9f, // Ÿ
};

function toWinAnsiBytes(input: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code >= 0x20 && code <= 0x7e) {
      bytes.push(code);
    } else if (code >= 0xa0 && code <= 0xff) {
      bytes.push(code);
    } else if (WINANSI_MAP[code] !== undefined) {
      bytes.push(WINANSI_MAP[code]);
    } else if (code === 0x202f || code === 0x00a0) {
      bytes.push(0x20); // French narrow non-breaking space -> standard space
    } else if (code === 0x2192 || code === 0x2794) {
      bytes.push(0x2d, 0x3e); // ->
    } else {
      bytes.push(0x20);
    }
  }
  return bytes;
}

function escapePdfLiteralBytes(rawBytes: number[]): string {
  let out = '(';
  for (const b of rawBytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) {
      out += '\\' + String.fromCharCode(b);
    } else if (b < 0x20 || b > 0x7e) {
      const oct = b.toString(8).padStart(3, '0');
      out += '\\' + oct;
    } else {
      out += String.fromCharCode(b);
    }
  }
  out += ')';
  return out;
}

function pdfText(text: string): string {
  return escapePdfLiteralBytes(toWinAnsiBytes(text));
}

function truncateText(text: string, maxLen: number): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, Math.max(0, maxLen - 3)) + '...';
}

function formatStatusLabel(status: DeliveryOrder['status']): string {
  switch (status) {
    case 'livree':
      return 'Livree (POD)';
    case 'en_cours':
      return 'En cours';
    case 'colis_recupere':
      return 'Colis recupere';
    case 'acceptee':
      return 'Acceptee';
    case 'assignee':
      return 'Assignee';
    case 'echec':
      return 'Litige/Echec';
    case 'en_attente':
    default:
      return 'En attente';
  }
}

export function buildVendorPdfReportBytes(input: VendorPdfReportInput): {
  pdfBytes: Uint8Array;
  filename: string;
} {
  const generatedAt = input.generatedAt || new Date();
  const safeStore = input.storeName || 'Boutique LivraLink';
  const dateSlug = generatedAt.toISOString().slice(0, 10);
  const cleanStoreSlug = safeStore.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Boutique';
  const filename = `Rapport_LivraLink_${cleanStoreSlug}_${dateSlug}.pdf`;

  const lines: Array<{ text: string; size: number; bold?: boolean; yStep?: number; x?: number }> = [
    { text: `LIVRALINK BENIN - RAPPORT VENDEUR CONSOLIDE`, size: 15, bold: true, yStep: 22, x: 44 },
    { text: `Boutique : ${truncateText(safeStore, 65)}`, size: 11, bold: true, yStep: 16, x: 44 },
    { text: `Periode : ${input.timeRangeLabel}   |   Genere le : ${generatedAt.toLocaleString('fr-FR')}`, size: 9, yStep: 20, x: 44 },
    { text: `----------------------------------------------------------------------------------------------`, size: 9, yStep: 14, x: 44 },
    { text: `INDICATEURS CLES DE PERFORMANCE`, size: 11, bold: true, yStep: 16, x: 44 },
    { text: `Total expeditions : ${input.totalOrders}   |   Livrees (POD) : ${input.deliveredOrders}   |   Taux de reussite : ${input.deliverySuccessRate}%`, size: 10, yStep: 15, x: 44 },
    { text: `Total COD encaisse : ${input.totalCODCollected.toLocaleString('fr-FR')} FCFA   |   Frais de livraison : ${input.totalDeliveryFees.toLocaleString('fr-FR')} FCFA`, size: 10, yStep: 20, x: 44 },
    { text: `----------------------------------------------------------------------------------------------`, size: 9, yStep: 14, x: 44 },
    { text: `DETAIL DES COURSES (${input.deliveries.length})`, size: 11, bold: true, yStep: 16, x: 44 },
    { text: `ID Course    | Client               | Commune              | COD (FCFA) | Frais   | Statut`, size: 8.5, bold: true, yStep: 14, x: 44 },
  ];

  if (input.deliveries.length === 0) {
    lines.push({ text: `Aucune course enregistree pour cette boutique sur la periode selectionnee.`, size: 9.5, yStep: 16, x: 44 });
  } else {
    for (const d of input.deliveries) {
      const idCol = truncateText(d.id, 12).padEnd(12, ' ');
      const clientCol = truncateText(d.clientName || 'Client', 20).padEnd(20, ' ');
      const communeCol = truncateText(d.dropoffLocation?.commune || 'Cotonou', 20).padEnd(20, ' ');
      const codCol = `${(d.itemValueCOD || 0).toLocaleString('fr-FR')}`.padStart(10, ' ');
      const feeCol = `${(d.deliveryFee || 0).toLocaleString('fr-FR')}`.padStart(7, ' ');
      const statusCol = formatStatusLabel(d.status);
      lines.push({
        text: `${idCol} | ${clientCol} | ${communeCol} | ${codCol} | ${feeCol} | ${statusCol}`,
        size: 8.2,
        yStep: 13,
        x: 44,
      });
    }
  }

  // Paginate lines across A4 pages (595 x 842 pt)
  const pageHeight = 842;
  const pageWidth = 595;
  const topY = 795;
  const bottomY = 55;

  const pagesContent: string[] = [];
  let currentCommands: string[] = [];
  let cursorY = topY;

  const flushPage = (pageIndex: number) => {
    currentCommands.push(
      `BT /F1 8 Tf 44 28 Td ${pdfText(`LivraLink Benin - Document genere automatiquement (Page ${pageIndex + 1})`)} ET`
    );
    pagesContent.push(currentCommands.join('\n'));
    currentCommands = [];
    cursorY = topY;
  };

  for (const line of lines) {
    const step = line.yStep || 14;
    if (cursorY - step < bottomY) {
      flushPage(pagesContent.length);
    }
    const fontKey = line.bold ? '/F2' : '/F1';
    const xPos = line.x ?? 44;
    currentCommands.push(`BT ${fontKey} ${line.size} Tf ${xPos} ${cursorY} Td ${pdfText(line.text)} ET`);
    cursorY -= step;
  }
  if (currentCommands.length > 0 || pagesContent.length === 0) {
    flushPage(pagesContent.length);
  }

  // Build PDF objects:
  // 1: Catalog
  // 2: Pages
  // 3: Font Regular (/F1 Helvetica WinAnsiEncoding)
  // 4: Font Bold (/F2 Helvetica-Bold WinAnsiEncoding)
  // 5..(4+2*N): Page + Content stream pairs
  const objects: string[] = [];
  const pageObjectIds: number[] = [];

  for (let i = 0; i < pagesContent.length; i++) {
    pageObjectIds.push(5 + i * 2);
  }

  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>\nendobj\n`);
  objects.push(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`);
  objects.push(`4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`);

  pagesContent.forEach((streamBody, idx) => {
    const pageObjId = 5 + idx * 2;
    const contentObjId = pageObjId + 1;
    objects.push(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentObjId} 0 obj\n<< /Length ${streamBody.length} >>\nstream\n${streamBody}\nendstream\nendobj\n`
    );
  });

  let pdfStr = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdfStr.length);
    pdfStr += obj;
  }
  const xrefStart = pdfStr.length;
  pdfStr += `xref\n0 ${objects.length + 1}\n`;
  pdfStr += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdfStr += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdfStr += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  const encoder = new TextEncoder();
  return {
    pdfBytes: encoder.encode(pdfStr),
    filename,
  };
}
