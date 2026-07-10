// Lightweight, dependency-free export helpers: CSV, Excel-compatible HTML, and a minimal PDF generator.
// No external npm packages required - works with plain Node.js Buffers/strings.

function escapeCsvValue(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function toCSV(columns, rows) {
  const header = columns.map((c) => escapeCsvValue(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => escapeCsvValue(row[c.key])).join(','));
  return [header, ...lines].join('\r\n');
}

function escapeHtml(val) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toExcelHTML(title, columns, rows) {
  const head = columns
    .map((c) => `<th style="background:#1f2937;color:#fff;padding:6px;border:1px solid #ccc;">${escapeHtml(c.label)}</th>`)
    .join('');
  const body = rows
    .map(
      (row) =>
        `<tr>${columns.map((c) => `<td style="padding:6px;border:1px solid #ccc;">${escapeHtml(row[c.key])}</td>`).join('')}</tr>`
    )
    .join('');
  return `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8" />
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${escapeHtml(
    title
  )}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>table{border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:12px;}</style>
</head><body><table border="1"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

// --- Minimal dependency-free PDF generator (single Type1/Helvetica font, classic xref table) ---
function pdfEscape(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildSimplePDF(title, columns, rows) {
  const PAGE_W = 792; // US Letter landscape
  const PAGE_H = 612;
  const MARGIN = 30;
  const ROW_H = 16;
  const rowsPerPage = Math.max(1, Math.floor((PAGE_H - MARGIN * 2 - 50) / ROW_H));

  const pagesData = [];
  for (let i = 0; i < rows.length; i += rowsPerPage) pagesData.push(rows.slice(i, i + rowsPerPage));
  if (pagesData.length === 0) pagesData.push([]);

  const usableWidth = PAGE_W - MARGIN * 2;
  const colWidth = usableWidth / columns.length;
  const maxCharsPerCol = Math.max(4, Math.floor(colWidth / 5.2));

  const truncate = (val) => {
    let s = val === null || val === undefined ? '' : String(val);
    if (s.length > maxCharsPerCol) s = s.slice(0, maxCharsPerCol - 1) + '…';
    return s;
  };

  const pageStrings = pagesData.map((pageRows, pageIdx) => {
    let y = PAGE_H - MARGIN;
    let content = `BT /F1 13 Tf ${MARGIN} ${y} Td (${pdfEscape(title)}) Tj ET\n`;
    y -= 14;
    content += `BT /F1 8 Tf ${MARGIN} ${y} Td (Page ${pageIdx + 1} of ${pagesData.length}) Tj ET\n`;
    y -= 18;

    let x = MARGIN;
    content += columns
      .map((c) => {
        const s = `BT /F1 9 Tf ${x.toFixed(1)} ${y} Td (${pdfEscape(truncate(c.label))}) Tj ET\n`;
        x += colWidth;
        return s;
      })
      .join('');
    y -= 4;
    content += `0.4 0.4 0.4 RG ${MARGIN} ${y} m ${PAGE_W - MARGIN} ${y} l S\n`;
    y -= ROW_H - 4;

    pageRows.forEach((row) => {
      x = MARGIN;
      content += columns
        .map((c) => {
          const s = `BT /F1 8 Tf ${x.toFixed(1)} ${y} Td (${pdfEscape(truncate(row[c.key]))}) Tj ET\n`;
          x += colWidth;
          return s;
        })
        .join('');
      y -= ROW_H;
    });
    return content;
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  function pushObj(str) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += str;
  }

  // 1: Catalog
  pushObj(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  // 2: Pages
  const kids = pageStrings.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  pushObj(`2 0 obj\n<< /Type /Pages /Kids [ ${kids} ] /Count ${pageStrings.length} >>\nendobj\n`);
  // 3: Font
  pushObj(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

  pageStrings.forEach((content, i) => {
    const pageObjNum = 4 + i * 2;
    const contentObjNum = 5 + i * 2;
    pushObj(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`
    );
    const contentBytes = Buffer.byteLength(content, 'latin1');
    pushObj(`${contentObjNum} 0 obj\n<< /Length ${contentBytes} >>\nstream\n${content}endstream\nendobj\n`);
  });

  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  const totalObjs = 3 + pageStrings.length * 2;
  let xref = `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`;
  for (let i = 0; i < totalObjs; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += xref;
  pdf += `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}

module.exports = { toCSV, toExcelHTML, buildSimplePDF, escapeHtml };
