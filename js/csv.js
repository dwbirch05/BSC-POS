// ---------------------------------------------------------------------------
// Minimal RFC4180-ish CSV parser/writer, hand-written (no external library)
// so bulk product import works fully offline with no CDN dependency and can
// be verified end-to-end in this project's own tests. Handles quoted fields,
// commas/newlines inside quotes, and "" as an escaped quote — the cases a
// naive text.split(",") gets wrong on a real product spreadsheet.
// ---------------------------------------------------------------------------

/** Parses CSV text into an array of row objects keyed by the header row. */
export function parseCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== "")) // skip blank lines
    .map((r) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
      return obj;
    });
}

/** Parses raw CSV text into an array of rows (each an array of cell strings). */
function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); field = "";
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** Serializes an array of row objects into CSV text using the given header order. */
export function toCsv(rows, headers) {
  const escape = (val) => {
    const s = val == null ? "" : String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}
