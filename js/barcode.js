// ---------------------------------------------------------------------------
// Code 39 barcode generator (pure JS, no external library / no network).
//
// Code 39 was chosen for self-generated SKU labels because it's simple,
// self-checking, universally supported by cheap USB laser scanners, and its
// character set covers exactly what we need: 0-9, A-Z and "-".
//
// IMPORTANT: every printed label also shows the SKU as large human-readable
// text, and the POS screen lets staff type/search a SKU manually. So even in
// the unlikely case a specific scanner has trouble with a printed label, the
// sale is never blocked -- there's always a manual fallback.
// ---------------------------------------------------------------------------

// Each entry: 9 elements (bar,space,bar,space,bar,space,bar,space,bar).
// N = narrow, W = wide. Every valid Code 39 character has exactly 3 W's.
const CODE39_TABLE = {
  "0": "NNNWWNWNN", "1": "WNNWNNNNW", "2": "NNWWNNNNW", "3": "WNWWNNNNN",
  "4": "NNNWWNNNW", "5": "WNNWWNNNN", "6": "NNWWWNNNN", "7": "NNNWNNWNW",
  "8": "WNNWNNWNN", "9": "NNWWNNWNN",
  "A": "WNNNNWNNW", "B": "NNWNNWNNW", "C": "WNWNNWNNN", "D": "NNNNWWNNW",
  "E": "WNNNWWNNN", "F": "NNWNWWNNN", "G": "NNNNNWWNW", "H": "WNNNNWWNN",
  "I": "NNWNNWWNN", "J": "NNNNWWWNN", "K": "WNNNNNNWW", "L": "NNWNNNNWW",
  "M": "WNWNNNNWN", "N": "NNNNWNNWW", "O": "WNNNWNNWN", "P": "NNWNWNNWN",
  "Q": "NNNNNNWWW", "R": "WNNNNNWWN", "S": "NNWNNNWWN", "T": "NNNNWNWWN",
  "U": "WWNNNNNNW", "V": "NWWNNNNNW", "W": "WWWNNNNNN", "X": "NWNNWNNNW",
  "Y": "WWNNWNNNN", "Z": "NWWNWNNNN",
  "-": "NWNNNNWNW", ".": "WWNNNNWNN", " ": "NWWNNNWNN",
  "$": "NWNWNWNNN", "/": "NWNWNNNWN", "+": "NWNNNWNWN", "%": "NNNWNWNWN",
  "*": "NWNNWNWNN", // start/stop character
};

/** True if every character in `text` can be encoded in Code 39. */
export function isCode39Encodable(text) {
  return [...text.toUpperCase()].every((ch) => CODE39_TABLE[ch] !== undefined);
}

/**
 * Encode `text` (start/stop '*' added automatically) into an array of
 * integer widths, alternating bar/space, starting and ending with a bar.
 */
function encodeWidths(text, narrow = 1, wide = 3) {
  const chars = ["*", ...text.toUpperCase().split(""), "*"];
  const widths = [];
  chars.forEach((ch, i) => {
    const pattern = CODE39_TABLE[ch];
    if (!pattern) throw new Error(`Character "${ch}" cannot be encoded in Code 39`);
    for (const el of pattern) widths.push(el === "W" ? wide : narrow);
    if (i < chars.length - 1) widths.push(narrow); // inter-character gap
  });
  return widths;
}

/**
 * Render `text` as an SVG barcode string (Code 39), with the human-readable
 * text underneath. Returns a full <svg>...</svg> string ready to inject.
 */
export function renderBarcodeSVG(text, { height = 60, narrow = 2, showText = true } = {}) {
  const widths = encodeWidths(text, narrow, narrow * 3);
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  const quiet = narrow * 10;
  const svgWidth = totalWidth + quiet * 2;
  const barsHeight = showText ? height : height;

  let x = quiet;
  let bar = true; // starts with a bar
  const rects = [];
  for (const w of widths) {
    if (bar) rects.push(`<rect x="${x}" y="0" width="${w}" height="${barsHeight}" fill="#000"/>`);
    x += w;
    bar = !bar;
  }

  const textEl = showText
    ? `<text x="${svgWidth / 2}" y="${barsHeight + 16}" text-anchor="middle" font-family="monospace" font-size="14" fill="#000">${escapeXml(text)}</text>`
    : "";

  const totalHeight = showText ? barsHeight + 22 : barsHeight;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${totalHeight}" width="${svgWidth}" height="${totalHeight}">
    <rect x="0" y="0" width="${svgWidth}" height="${totalHeight}" fill="#fff"/>
    ${rects.join("\n")}
    ${textEl}
  </svg>`;
}

function escapeXml(s) {
  return String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}

/** Generate the next sequential internal SKU, e.g. BSC-000123. */
export function generateSku(nextNumber) {
  return `BSC-${String(nextNumber).padStart(6, "0")}`;
}
