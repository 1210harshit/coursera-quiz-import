// A depth-aware replacement for lib-outline-course's readBlocks, for sources whose
// learning-items tables are NESTED inside other tables.
//
// Why this exists. lib-outline-course finds tables with `/<w:tbl>[\s\S]*?<\/w:tbl>/` — a
// non-greedy match. That is correct as long as no table contains another one. The Digital
// Transformation outline nests them three deep: of its 216 `<w:tbl>` opens, 172 are inside
// another table. Against that document the non-greedy match runs from an OUTER open to the
// FIRST inner close, so every outer table is truncated mid-row and the remainder of its rows
// leak out as loose body paragraphs. The visible symptom is a learning-items table that reads
// as `| Video 2 | |` followed by the title, format, description and duration arriving as bare
// paragraphs — one logical row shredded across four blocks. Nothing errors; the parse simply
// loses most of the course.
//
// This module reads the same document with a balanced scan instead, and returns the SAME block
// shape lib-outline-course returns — {type:'p',text} and {type:'table',rows} in document order
// — so a parser can swap one import for the other and change nothing else.
//
// Three rules make the scan correct:
//   * a table block runs from an open at depth 0 to the close that returns depth to 0;
//   * a row or cell belongs to a table only when no nested table is open between it and that
//     table, so an inner table's rows never masquerade as the outer table's;
//   * a cell's text is every paragraph inside it INCLUDING those in nested tables, in document
//     order. In this source the value of a row is often written inside a one-cell table sitting
//     in the outer cell, so ignoring nested content would empty half the columns.
//
// Paragraph handling matches lib-outline-course exactly — struck runs dropped, `<w:br/>` as a
// newline, `<w:tab/>` as a space, and cell text trimmed only at its ends so the run of spaces
// inside a line stays the author's. The two must agree: a parser is expected to behave
// identically whichever reader it is given.
const fs = require('fs');
const shared = require('./lib-outline-course');

const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
                  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const clean = s => s.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();

// A run whose own properties carry <w:strike/> is superseded draft wording. Identical to
// lib-outline-course's isStruck, including the <w:rPrChange> strip.
function isStruck(run) {
  const r = run.replace(/<w:rPrChange[\s\S]*?<\/w:rPrChange>/g, '');
  const props = r.split(/<w:t[\s>]/)[0];
  return /<w:strike(?:\s+w:val="(?:1|true|on)")?\s*\/>/.test(props);
}

function paraText(p) {
  const s = p.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, run => (isStruck(run) ? '' : run));
  let out = '';
  for (const m of s.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/?>|<w:tab\s*\/?>/g)) {
    out += m[1] !== undefined ? dec(m[1]) : (m[0].startsWith('<w:tab') ? ' ' : '\n');
  }
  return out;
}

const cellTrim = s => String(s).replace(/ /g, ' ').replace(/^[ \t]+|[ \t]+$/g, '').trim();

/** Balanced top-level `<w:tbl>` spans, in document order, each with its offset in `xml`. */
function topTables(xml) {
  const out = [];
  let depth = 0, start = -1;
  for (const m of xml.matchAll(/<w:tbl>|<\/w:tbl>/g)) {
    if (m[0] === '<w:tbl>') { if (depth === 0) start = m.index; depth++; }
    else { depth--; if (depth === 0 && start >= 0) out.push({ start, end: m.index + m[0].length }); }
  }
  return out.map(t => ({ start: t.start, end: t.end, xml: xml.slice(t.start, t.end) }));
}

/** Rows belonging to THIS table — not to any table nested inside it. */
function directRows(tblXml) {
  const inner = tblXml.replace(/^<w:tbl>/, '').replace(/<\/w:tbl>$/, '');
  const out = [];
  let nested = 0, start = -1;
  for (const m of inner.matchAll(/<w:tbl>|<\/w:tbl>|<w:tr\b[^>]*>|<\/w:tr>/g)) {
    if (m[0] === '<w:tbl>') { nested++; continue; }
    if (m[0] === '</w:tbl>') { nested--; continue; }
    if (nested > 0) continue;
    if (m[0] === '</w:tr>') { if (start >= 0) out.push(inner.slice(start, m.index)); start = -1; }
    else start = m.index + m[0].length;
  }
  return out;
}

/** Cells belonging to THIS row — not to any table nested inside it. */
function directCells(rowXml) {
  const out = [];
  let nested = 0, start = -1;
  for (const m of rowXml.matchAll(/<w:tbl>|<\/w:tbl>|<w:tc(?:\s[^>]*)?>|<\/w:tc>/g)) {
    if (m[0] === '<w:tbl>') { nested++; continue; }
    if (m[0] === '</w:tbl>') { nested--; continue; }
    if (nested > 0) continue;
    if (m[0] === '</w:tc>') { if (start >= 0) out.push(rowXml.slice(start, m.index)); start = -1; }
    else start = m.index + m[0].length;
  }
  return out;
}

// Every paragraph in the cell, nested tables included, joined by newline. See the header for
// why nested content is read rather than skipped.
const cellString = tc => [...tc.matchAll(/<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g)]
  .map(p => cellTrim(paraText(p[0]))).filter(Boolean).join('\n');

/** Body of a document.xml as an ordered list of {type:'p',text} and {type:'table',rows}. */
function readBlocks(documentXml) {
  const xml = fs.readFileSync(documentXml, 'utf8');
  const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [null, xml])[1];
  const tables = topTables(body);

  const blocks = tables.map(t => ({
    at: t.start,
    type: 'table',
    rows: directRows(t.xml).map(r => directCells(r).map(cellString)),
  }));

  // Only paragraphs OUTSIDE every table are body paragraphs. A paragraph inside one is part of
  // its cell and has already been read there; emitting it again is what makes a shredded table
  // look like prose.
  let ti = 0;
  for (const m of body.matchAll(/<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g)) {
    while (ti < tables.length && tables[ti].end <= m.index) ti++;
    if (ti < tables.length && m.index >= tables[ti].start && m.index < tables[ti].end) continue;
    blocks.push({ at: m.index, type: 'p', text: clean(paraText(m[0])) });
  }

  blocks.sort((a, b) => a.at - b.at);
  for (const b of blocks) delete b.at;
  return blocks;
}

module.exports = {
  readBlocks,
  isItemHeader: shared.isItemHeader,
  itemType: shared.itemType,
  videoType: shared.videoType,
  minutes: shared.minutes,
  cellText: shared.cellText,
  clean: shared.clean,
  writeJson: shared.writeJson,
  path: shared.path,
  fs: shared.fs,
};
