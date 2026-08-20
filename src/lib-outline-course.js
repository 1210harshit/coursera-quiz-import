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

// A run whose own properties carry <w:strike/> is superseded draft wording. Sources keep it
// inline next to the replacement, so reading it would splice both into one sentence.
// <w:rPrChange> holds the *previous* formatting under tracked changes and is stripped first,
// otherwise an old strike that has since been removed would read as current.
function isStruck(run) {
  const r = run.replace(/<w:rPrChange[\s\S]*?<\/w:rPrChange>/g, '');
  const props = r.split(/<w:t[\s>]/)[0];                   // properties always precede text
  return /<w:strike(?:\s+w:val="(?:1|true|on)")?\s*\/>/.test(props);
}

function paraText(p) {
  // <w:br/> separates lines inside one paragraph in several sources; keep them as newlines
  // so multi-question DPQ cells and role-play briefs survive as written.
  let s = p.replace(/<w:br\s*\/>/g, '\n').replace(/<w:tab\s*\/>/g, ' ');
  s = s.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, run => (isStruck(run) ? '' : run));
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

// Outline item label -> Coursera item type.
//
// EVERY VALUE HERE MUST BE ONE THE IMPORTER ACCEPTS. That set is exactly what the bundled
// Course Template's "Ranges" sheet lists: Video, Reading, Discussion Prompt, Graded Discussion
// Prompt, Programming, Peer Review, App item, Ungraded Lab, Assignment, Teammate Review,
// Ungraded Plugin. Anything else is rejected item-by-item with a processing error, and the
// import silently drops those rows while reporting success for the rest.
//
// This was learned the hard way. An earlier revision mapped role plays to "Roleplay" and
// practice quizzes to "Quiz" — Coursera's own names for those items — and had the builder
// append them to the Ranges lookup so the dropdown would accept them. The workbook built and
// verified clean, then the import returned:
//
//     Item type Quiz is not supported
//     ITEM_TYPE_UNSET item in cell A49 ... Invalid item type
//
// Widening the dropdown only satisfies Excel. The importer has its own list and does not read
// that sheet. course-import-build.js now refuses to build an unlisted type rather than
// appending it.
//
// Hands-on labs map to Peer Review, not Ungraded Lab: the labs in these outlines all end in a
// submitted deliverable ("Submit a document containing three versions…"), which is a graded
// peer-assessed artefact rather than an in-platform lab environment.
//
// Role plays and coach dialogues map to Ungraded Plugin. Coursera's AI role-play item is
// delivered as a plugin, and both are ungraded applied practice — the outlines say so outright
// ("run as ungraded applied practice before the graded assessment").
//
// Practice quizzes and interactive assessments map to Assignment, the only quiz item the
// importer creates. NOTE THE CONSEQUENCE: they arrive GRADED and count towards the course
// grade until someone changes that in Coursera. The alternative — Ungraded Plugin — keeps them
// ungraded but is not a quiz, so the practice questions could not be imported into it. If you
// would rather they were true practice quizzes, drop these rows from the workbook and create
// the items by hand in Coursera; you already have to open each one to import its questions.
//
// The Reading list is deliberately broad. Coursera has one item type for anything the learner
// reads or downloads, so an outline's infographic, cheat sheet, reference guide, diagnostic
// guidance note and recommended-path companion are all Readings once imported — the outline's
// own label survives in the item name, which is where the distinction belongs.
function itemType(label) {
  const l = (label || '').trim();
  if (/^(intro\s*video|video\s*(intro|outro)\b|video\s*\d*|promo\s*video)/i.test(l)) return 'Video';
  if (/^(reading|infographic|reference\s*guide|cheat\s*sheet|downloadable|recommended\s*learning\s*path|pre[-\s]?course\s*diagnostic\s*guidance)/i.test(l))
                                                             return 'Reading';
  if (/^(dpq|discussion)/i.test(l))                          return 'Discussion Prompt';
  if (/^hands[-\s]?on/i.test(l))                             return 'Peer Review';
  if (/^(role\s*play|roleplay|coach\s*dialogue)/i.test(l))   return 'Ungraded Plugin';
  if (/^(graded\s*(quiz|assessment)|practice\s*quiz|interactive\s*assessment|knowledge\s*check|ungraded\s*quiz)/i.test(l))
                                                             return 'Assignment';
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
