// Minimal SpreadsheetML plumbing for cloning a workbook and rewriting one sheet.
//
// The course-content importer does not author a sheet from scratch. Coursera's Course
// Template carries dropdown validation, a hidden "Ranges" lookup and a duration number
// format that the importer relies on, so the builder clones the template's own rows and
// substitutes values into them. Everything here exists to make that clone-and-substitute
// cheap: shared strings, a row splitter, and a cell rewriter that preserves the style id.
const fs = require('fs');
const path = require('path');

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
                     .replace(/&apos;/g, "'")
                     .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
                     .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
                     .replace(/&amp;/g, '&');

// Newlines survive as &#10; — descriptions carry paragraph breaks and Excel keeps them
// only when the cell style also sets wrapText.
const encode = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                             .replace(/\r\n/g, '\n').replace(/\n/g, '&#10;');

/** Shared string table, opened for append. Existing entries keep their index. */
class SharedStrings {
  constructor(stageDir) {
    this.file = path.join(stageDir, 'xl', 'sharedStrings.xml');
    const xml = fs.readFileSync(this.file, 'utf8');
    const headEnd = xml.indexOf('>', xml.indexOf('<sst ')) + 1;
    this.head = xml.slice(0, headEnd);
    this.body = xml.slice(headEnd, xml.lastIndexOf('</sst>'));
    this.count = (this.body.match(/<si>/g) || []).length;
    this.added = new Map();
  }

  /** Plain text of an existing entry, or null. Used to read the template's own labels. */
  at(i) {
    const all = [...this.body.matchAll(/<si>[\s\S]*?<\/si>/g)];
    if (!all[i]) return null;
    return decode([...all[i][0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join(''));
  }

  index(text) {
    if (this.added.has(text)) return this.added.get(text);
    const i = this.count++;
    this.body += `<si><t xml:space="preserve">${encode(text)}</t></si>`;
    this.added.set(text, i);
    return i;
  }

  /** `cellCount` is the total t="s" cells across all sheets; Excel treats it as advisory. */
  write(cellCount) {
    fs.writeFileSync(this.file,
      this.head.replace(/count="\d+"/, `count="${cellCount}"`)
               .replace(/uniqueCount="\d+"/, `uniqueCount="${this.count}"`)
      + this.body + '</sst>');
  }
}

/** Append one cellXf to styles.xml and return its index. */
function addCellStyle(stageDir, xf) {
  const file = path.join(stageDir, 'xl', 'styles.xml');
  let xml = fs.readFileSync(file, 'utf8');
  const start = xml.indexOf('<cellXfs');
  const openEnd = xml.indexOf('>', start) + 1;
  const end = xml.indexOf('</cellXfs>');
  const n = +xml.slice(start, openEnd).match(/count="(\d+)"/)[1];
  xml = xml.slice(0, start)
      + xml.slice(start, openEnd).replace(/count="\d+"/, `count="${n + 1}"`)
      + xml.slice(openEnd, end) + xf + xml.slice(end);
  fs.writeFileSync(file, xml);
  return n;
}

/** Split a worksheet into { head, rows: {n: rawXml}, tail } around <sheetData>. */
function openSheet(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const start = xml.indexOf('<sheetData>') + '<sheetData>'.length;
  const end = xml.indexOf('</sheetData>');
  const rows = {};
  const re = /<row[^>]*r="(\d+)"[^>]*>[\s\S]*?<\/row>|<row[^>]*r="(\d+)"[^>]*\/>/g;
  let m;
  while ((m = re.exec(xml.slice(start, end))) !== null) rows[+(m[1] || m[2])] = m[0];
  return { head: xml.slice(0, start), rows, tail: xml.slice(end) };
}

const CELL_RE = /<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;

/**
 * Clone a template row at a new row number, substituting cells by column letter.
 *
 * A column absent from `values` keeps the template's own cell verbatim — that is how the
 * fixed labels ("Module", "***Name", the item header row) survive untouched. A column
 * present but null becomes an empty cell that keeps its style. Values:
 *   {s} shared string · {n} number · {b} 0|1 boolean · {f,v} formula + cached result
 * `xf` on any of them overrides the style id.
 */
function emitRow(tplXml, newRow, values = {}, sst, rowAttrExtra = '') {
  const open = tplXml.match(/^<row[^>]*>/)[0];
  const inner = tplXml.replace(/^<row[^>]*>/, '').replace(/<\/row>$/, '');
  const attrs = open.slice(4, -1)
    .replace(/\sr="\d+"/, '').replace(/\sht="[^"]*"/, '')
    .replace(/\scustomHeight="[^"]*"/, '').replace(/\sspans="[^"]*"/, '');

  let out = '';
  for (const c of inner.matchAll(CELL_RE)) {
    const col = c[1].match(/r="([A-Z]+)\d+"/)[1];
    if (!Object.prototype.hasOwnProperty.call(values, col)) {
      out += c[0].replace(/r="[A-Z]+\d+"/, `r="${col}${newRow}"`);
      continue;
    }
    const v = values[col];
    let s = (c[1].match(/s="(\d+)"/) || [])[1];
    if (v && v.xf !== undefined) s = String(v.xf);
    const sAttr = s !== undefined ? ` s="${s}"` : '';
    const ref = `<c r="${col}${newRow}"${sAttr}`;
    if (v === null || v === undefined)   out += `${ref}/>`;
    else if (v.s !== undefined)          out += `${ref} t="s"><v>${sst.index(v.s)}</v></c>`;
    else if (v.n !== undefined)          out += `${ref}><v>${v.n}</v></c>`;
    else if (v.b !== undefined)          out += `${ref} t="b"><v>${v.b}</v></c>`;
    else if (v.f !== undefined)          out += `${ref}><f>${encode(v.f)}</f><v>${v.v}</v></c>`;
    else throw new Error(`unsupported cell value at ${col}${newRow}: ${JSON.stringify(v)}`);
  }
  return `<row r="${newRow}"${attrs}${rowAttrExtra}>${out}</row>`;
}

/** Total t="s" cells across every sheet, for the sharedStrings count attribute. */
function countStringCells(stageDir) {
  const dir = path.join(stageDir, 'xl', 'worksheets');
  return fs.readdirSync(dir).filter(f => f.endsWith('.xml'))
    .reduce((n, f) => n + (fs.readFileSync(path.join(dir, f), 'utf8').match(/t="s"/g) || []).length, 0);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name), d = path.join(to, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

module.exports = { decode, encode, SharedStrings, addCellStyle, openSheet, emitRow, countStringCells, copyDir };
