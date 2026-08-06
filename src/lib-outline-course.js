// Shared pieces for the course-content outline parsers.
//
// Every Starweaver outline lays its learning items out the same way — a table per lesson
// whose first column names the item kind ("Video 1", "DPQ", "Hands-on-lab") — so the item
// mapping, the duration rules and the block reader live here. What differs between sources
// is the heading grammar around those tables, and that stays in the per-course parser.
const fs = require('fs');
const path = require('path');

const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
                  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const clean = s => s.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();

function paraText(p) {
  // <w:br/> separates lines inside one paragraph in several sources; keep them as newlines
  // so multi-question DPQ cells and role-play briefs survive as written.
  let s = p.replace(/<w:br\s*\/>/g, '\n').replace(/<w:tab\s*\/>/g, ' ');
  return [...s.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m => dec(m[1])).join('');
}

/** Body of a document.xml as an ordered list of {type:'p',text} and {type:'table',rows}. */
function readBlocks(documentXml) {
  const xml = fs.readFileSync(documentXml, 'utf8');
  const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [null, xml])[1];
  const blocks = [];
  const blockRe = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
  let bm;
  while ((bm = blockRe.exec(body)) !== null) {
    const b = bm[0];
    if (!b.startsWith('<w:tbl')) { blocks.push({ type: 'p', text: clean(paraText(b)) }); continue; }
    const rows = [];
    for (const rm of b.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
      const cells = [];
      for (const cm of rm[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)) {
        const ps = [...cm[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g)]
          .map(p => clean(paraText(p[0]))).filter(Boolean);
        cells.push(ps.join('\n'));
      }
      rows.push(cells);
    }
    blocks.push({ type: 'table', rows });
  }
  return blocks;
}

/** True for the header row of a learning-items table. */
const isItemHeader = cells => /^Learning Items?$/i.test((cells[0] || '').trim());

// Outline item label -> Coursera item type. Every target type below is valid under both the
// Private and the Public offering type, so the choice in B23 cannot invalidate an import.
function itemType(label) {
  const l = (label || '').trim();
  if (/^(intro\s*video|video\s*\d*|promo\s*video)/i.test(l)) return 'Video';
  if (/^reading/i.test(l))                                   return 'Reading';
  if (/^(dpq|discussion)/i.test(l))                          return 'Discussion Prompt';
  if (/^hands[-\s]?on/i.test(l))                             return 'Ungraded Lab';
  if (/^role\s*play/i.test(l))                               return 'Ungraded Plugin';
  if (/^graded\s*quiz/i.test(l))                             return 'Assignment';
  if (/^course[-\s]?end\s*project/i.test(l))                 return 'Peer Review';
  return null;
}

// Outline "Video Format" -> the template's Video type dropdown, which offers exactly three.
function videoType(format) {
  const f = (format || '').trim();
  if (/talking\s*head/i.test(f))                    return 'Talking head';
  if (/screen|demo|walkthrough/i.test(f))           return 'Screen capture';
  if (/conceptual|slide|voice/i.test(f))            return 'Slide voiceover';
  return 'Slide voiceover';                         // conceptual is the commonest default
}

/**
 * "5-7 mins" -> 6. Ranges collapse to their midpoint, rounded; "<=4 mins" takes the bound.
 * Returns null when the cell says nothing, so the caller can warn and apply its own default.
 */
function minutes(text) {
  const t = (text || '').replace(/–|—/g, '-').trim();
  if (!t) return null;
  const range = t.match(/(\d+)\s*-\s*(\d+)/);
  if (range) return Math.round((+range[1] + +range[2]) / 2);
  const one = t.match(/(\d+)/);
  return one ? +one[1] : null;
}

/** Collapse the whitespace an outline table cell picks up, keeping paragraph breaks. */
function cellText(s) {
  return (s || '').split('\n').map(l => clean(l)).filter(Boolean).join('\n');
}

function writeJson(obj, warnings) {
  if (process.argv.includes('--report')) {
    const mods = obj.modules.length;
    const lessons = obj.modules.reduce((a, m) => a + m.lessons.length, 0);
    const items = obj.modules.flatMap(m => m.lessons.flatMap(l => l.items));
    console.log(`${obj.title}`);
    for (const m of obj.modules) {
      console.log(`  Module ${m.number} — ${m.name}`);
      for (const l of m.lessons) console.log(`    ${l.name}  (${l.items.length} items)`);
    }
    const byType = {};
    for (const i of items) byType[i.type] = (byType[i.type] || 0) + 1;
    console.log(`\n${mods} modules · ${lessons} lessons · ${items.length} items · `
      + `${items.filter(i => i.ivq).length} IVQs · `
      + `${items.reduce((a, i) => a + i.min, 0)} minutes`);
    console.log(Object.entries(byType).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
    console.log(`\nwarnings: ${warnings.length}`);
    for (const w of warnings) console.log('  ' + w);
    return;
  }
  for (const w of warnings) console.error('WARN ' + w);
  console.log(JSON.stringify(obj, null, 2));
}

module.exports = { readBlocks, isItemHeader, itemType, videoType, minutes, cellText, clean, writeJson, path, fs };
