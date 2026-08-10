// course.json -> Coursera Course Import .xlsx (the "FOR IMPORT" sheet, filled).
//
//   node src/course-import-build.js <slug> [outDir]
//
// Unlike the quiz builders there is one builder for every course: the parsers already
// normalise to a single course.json shape, so nothing here is course-specific.
//
// The template is cloned rather than rebuilt. Its "FOR IMPORT" sheet is regenerated row by
// row from the template's own rows, so the item-type dropdown, the Ranges lookup and the
// [h]:mm:ss duration format survive untouched. The three other sheets are left alone.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { SharedStrings, addCellStyle, openSheet, emitRow, countStringCells, copyDir } = require('./lib-xlsx');
const { zipDir } = require('./lib-zipwriter');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const slug = process.argv[2];
if (!slug) { console.error('usage: course-import-build.js <slug> [outDir]'); process.exit(2); }

// Template source. An unzipped work/tmpl-course/ wins when present — that is how you try a
// newer template without touching the repo. Otherwise the blank copy committed under
// templates/ is unzipped straight into the staging directory, so a fresh clone builds with
// nothing to download.
const TMPL_DIR = path.join(SP, 'tmpl-course');
const TMPL_XLSX = path.join(__dirname, '..', 'templates', 'coursera-course-template.xlsx');
const course = JSON.parse(fs.readFileSync(path.join(SP, slug, 'course.json'), 'utf8'));
const outDir = process.argv[3] || path.join(SP, slug, 'dist');

// Template row numbers, by role. Row order in the sheet is fixed by Coursera; these are the
// rows the builder clones. See README "Course-content import" for the full layout.
const T = {
  courseBand: 15, title: 16, description: 17, timeEstimate: 18, addRows: 19,
  blank20: 20, blank21: 21, offeringNote: 22, offeringType: 23, blank24: 24, blank25: 25,
  module: 26, modName: 27, modDesc: 28, modTime: 29, blankAfterModTime: 30,
  loHeader: 31, lo: 32, blankAfterLOs: 35,
  lesson: 36, lesName: 37, itemsBand: 49, itemHeader: 50, item: 51,
  lessonAddRows: 56, lessonSpacer: 57,
  summaryBand: 121, summaryHeader: 122, summaryFirst: 123, summaryRows: 11, trailing: 134,
};

const MIN_PER_DAY = 1440;                     // Excel stores the duration as a fraction of a day
const days = m => m / MIN_PER_DAY;
const LONG_DESC = 400;                        // role plays and project briefs; cap the row height

// Coursera rejects an item whose name is under five characters, one row at a time, with:
//
//   Video item in cell A206 failed to be processed. Error reason: Item name is too short in
//   cell B206.
//
// Found the hard way on paid-ads-11, where an outline names a Meta Business Suite video just
// "Help". Four characters fail; the same sheet's "Rules" at five imports fine. The whole
// upload is not rejected — the offending items are simply dropped, which is worse, so this is
// a hard failure at build time rather than a warning.
const MIN_ITEM_NAME = 5;

{
  const short = [];
  for (const m of course.modules) {
    for (const l of m.lessons) {
      for (const i of l.items) {
        if ((i.name || '').trim().length < MIN_ITEM_NAME) {
          short.push(`  module ${m.number} · ${l.name} · ${i.type} "${i.name}" (${(i.name || '').trim().length} chars)`
            + (i.ref ? `  [${i.ref}]` : ''));
        }
      }
    }
  }
  if (short.length) {
    console.error(`${short.length} item name(s) shorter than ${MIN_ITEM_NAME} characters — `
      + 'Coursera drops these rows on import:\n' + short.join('\n')
      + '\n\nGive each a fuller name in the outline, in the parser\'s NAME_FIXUPS, or directly in '
      + `${path.join(SP, slug, 'course.json')}, then rebuild.`);
    process.exit(1);
  }
}

// Coursera keeps adding item types; the bundled Course Template's "Ranges" sheet is a
// snapshot from when it was published. Any type a course uses that the sheet does not list is
// appended to it at build time (rows 15+ of columns B-F), and the item-type dropdown is
// widened to match — otherwise the value imports fine but the dropdown rejects it on edit and
// the verifier, which reads that sheet, calls it invalid.
//
// Appending to B, C and D asserts the type is offered under Private, Public and Your Org
// alike. That is the safe default; narrow it here if Coursera restricts one.
const RANGES_FIRST_ROW = 3;                   // E3 is "Select an item type"
const RANGES_LAST_TEMPLATE_ROW = 14;
const RANGES_CLONE_ROW = 4;                   // first row with every column populated

// --- stage a copy of the template ------------------------------------------------------
const stage = path.join(SP, slug, '.stage');
fs.rmSync(stage, { recursive: true, force: true });

if (fs.existsSync(path.join(TMPL_DIR, 'xl', 'worksheets', 'sheet3.xml'))) {
  copyDir(TMPL_DIR, stage);
  console.error(`using the unzipped template at ${path.relative(process.cwd(), TMPL_DIR)}`);
} else if (fs.existsSync(TMPL_XLSX)) {
  fs.mkdirSync(stage, { recursive: true });
  execFileSync('unzip', ['-q', '-o', TMPL_XLSX, '-d', stage]);
} else {
  console.error(`no course template: expected ${TMPL_XLSX} or an unzipped copy at ${TMPL_DIR}`);
  process.exit(1);
}
if (!fs.existsSync(path.join(stage, 'xl', 'worksheets', 'sheet3.xml'))) {
  console.error('template has no xl/worksheets/sheet3.xml — that sheet is "FOR IMPORT"');
  process.exit(1);
}

const sst = new SharedStrings(stage);
// The template's description cells do not wrap, which makes a 2,000-character role-play
// brief unreadable in review. One extra style, applied to the item description column only.
const WRAP = addCellStyle(stage,
  '<xf borderId="0" fillId="3" fontId="35" numFmtId="0" xfId="0" applyAlignment="1" applyFont="1">'
  + '<alignment readingOrder="0" shrinkToFit="0" vertical="top" wrapText="1"/></xf>');

const sheetFile = path.join(stage, 'xl', 'worksheets', 'sheet3.xml');   // "FOR IMPORT"
const { head, rows: TPL, tail: rawTail } = openSheet(sheetFile);

const rangesFile = path.join(stage, 'xl', 'worksheets', 'sheet4.xml');  // "Ranges (Please dont change)"
const ranges = openSheet(rangesFile);

// --- totals ----------------------------------------------------------------------------
const allItems = course.modules.flatMap(m => m.lessons.flatMap(l => l.items));
const totalMin = allItems.reduce((a, i) => a + i.min, 0);
const ivqTotal = allItems.filter(i => i.ivq).length;
const typeCounts = {};
for (const i of allItems) typeCounts[i.type] = (typeCounts[i.type] || 0) + 1;

// --- extend the Ranges lookup with any item type the template predates --------------------
const listed = [];
for (let n = RANGES_FIRST_ROW; n <= RANGES_LAST_TEMPLATE_ROW; n++) {
  const c = (ranges.rows[n] || '').match(/<c\s+r="E\d+"[^>]*t="s"[^>]*><v>(\d+)<\/v><\/c>/);
  if (c) listed.push(sst.at(+c[1]));
}
const missingTypes = Object.keys(typeCounts).filter(t => !listed.includes(t));
let rangesLastRow = RANGES_LAST_TEMPLATE_ROW;

if (missingTypes.length) {
  for (const type of missingTypes) {
    const n = ++rangesLastRow;
    const row = emitRow(ranges.rows[RANGES_CLONE_ROW], n, {
      A: null,
      B: { s: type }, C: { s: type }, D: { s: type }, E: { s: type }, F: { s: type },
    }, sst);
    ranges.rows[n] = row;                       // replaces the template's empty row n
  }
  const body = Object.keys(ranges.rows).map(Number).sort((a, b) => a - b)
    .map(n => ranges.rows[n]).join('');
  fs.writeFileSync(rangesFile, ranges.head + body + ranges.tail);
  console.error(`WARN item types absent from the template's Ranges sheet, appended: `
    + missingTypes.join(', '));
}

// --- rows ------------------------------------------------------------------------------
const out = [];
let r = 0;
const at = (tpl, values, extra) => out.push(emitRow(TPL[tpl], ++r, values, sst, extra));

// Rows 1-14 are the tips and key block; they carry the hyperlink anchored at A1. Verbatim.
for (let i = 1; i <= 14; i++) {
  const n = ++r;
  out.push(TPL[i].replace(/r="([A-Z]*)\d+"/g, (_, c) => `r="${c}${n}"`));
}

at(T.courseBand);
at(T.title,        { B: { s: course.title } });
at(T.description,  { B: { s: course.description } }, ' ht="220" customHeight="1"');
at(T.timeEstimate, { B: { n: days(totalMin) } });
at(T.addRows);
at(T.blank20); at(T.blank21); at(T.offeringNote);
at(T.offeringType, { B: { s: course.offeringType } });
at(T.blank24); at(T.blank25);

const itemRanges = [];
for (const mod of course.modules) {
  const modMin = mod.lessons.reduce((a, l) => a + l.items.reduce((b, i) => b + i.min, 0), 0);
  at(T.module,  { B: { n: Number(mod.number) } });
  at(T.modName, { B: { s: mod.name } });
  at(T.modDesc, { B: { s: mod.description } }, ' ht="120" customHeight="1"');
  at(T.modTime, { B: { n: days(modMin) } });
  at(T.blankAfterModTime);
  at(T.loHeader);
  for (const lo of mod.objectives) at(T.lo, { A: { s: lo } });
  at(T.blankAfterLOs);

  for (const les of mod.lessons) {
    at(T.lesson,  { B: { n: Number(les.number) } });
    at(T.lesName, { B: { s: les.name } });
    at(T.itemsBand);
    at(T.itemHeader);
    const first = r + 1;
    for (const it of les.items) {
      const desc = it.desc || '';
      at(T.item, {
        A: { s: it.type },
        B: { s: it.name },
        C: { s: desc, xf: WRAP },
        D: { n: days(it.min) },
        E: it.link ? { s: it.link } : null,
        F: it.ref ? { s: it.ref } : null,
        G: { b: it.ivq ? 1 : 0 },
        H: it.type === 'Video' && it.vtype ? { s: it.vtype } : null,
        I: course.sme ? { s: course.sme } : null,
        J: null, K: { b: 0 }, L: null, M: { b: 0 },
      }, desc.length > LONG_DESC ? ' ht="150" customHeight="1"'
       : desc.length > 150       ? ' ht="60" customHeight="1"' : '');
    }
    itemRanges.push({ first, last: r });
    at(T.lessonAddRows);
    at(T.lessonSpacer);
  }
}

// --- summary block ---------------------------------------------------------------------
// The template ships five fixed type labels plus six free rows. Types the course uses that
// the fixed labels miss (Peer Review, Ungraded Lab, Ungraded Plugin) claim the free rows,
// so the counts add up to the item total instead of silently dropping.
const itemFirst = itemRanges[0].first;
const itemLast = itemRanges[itemRanges.length - 1].last;
at(T.summaryBand);
at(T.summaryHeader);
const sumStart = r + 1;

const fixedLabels = [];
for (let i = 0; i < T.summaryRows; i++) {
  const m = TPL[T.summaryFirst + i].match(/<c r="A\d+"[^>]*t="s"><v>(\d+)<\/v><\/c>/);
  fixedLabels.push(m ? sst.at(+m[1]) : null);
}
const spare = Object.keys(typeCounts).filter(t => !fixedLabels.includes(t));

for (let i = 0; i < T.summaryRows; i++) {
  const values = {};
  let label = fixedLabels[i];
  if (label === 'Select an item type' && spare.length) {
    label = spare.shift();
    values.A = { s: label };
  }
  values.B = { f: `COUNTIF($A$${itemFirst}:$A$${itemLast}, A${sumStart + i})`, v: typeCounts[label] || 0 };
  if (i === 0) {
    values.D = { f: `SUM(D${itemFirst}:D${itemLast})`, v: days(totalMin) };
    values.G = { f: `COUNTIF(G${itemFirst}:G${itemLast},TRUE)`, v: ivqTotal };
  }
  at(T.summaryFirst + i, values);
}
for (let i = 0; i < 3; i++) at(T.trailing);

// --- sheet tail ------------------------------------------------------------------------
// Conditional formatting only reddened the template's placeholder strings, which are all
// gone; its ranges would be wrong anyway. The cell notes are anchored to template row
// numbers, so the legacy drawing goes too rather than pointing tips at unrelated cells.
const range = col => itemRanges.map(x => `${col}${x.first}:${col}${x.last}`).join(' ');
let tail = rawTail
  .replace(/<conditionalFormatting[\s\S]*?<\/conditionalFormatting>/g, '')
  .replace(/<legacyDrawing[^>]*\/>/, '')
  .replace(/<dataValidations>[\s\S]*?<\/dataValidations>/,
    '<dataValidations>'
    + `<dataValidation type="list" allowBlank="1" sqref="B23"><formula1>'Ranges (Please dont change)'!$A$2:$D$2</formula1></dataValidation>`
    + `<dataValidation type="list" allowBlank="1" sqref="${range('A')} A${sumStart}:A${sumStart + T.summaryRows - 1}">`
    + `<formula1>'Ranges (Please dont change)'!$E$${RANGES_FIRST_ROW}:$E$${rangesLastRow}</formula1></dataValidation>`
    + `<dataValidation type="list" allowBlank="1" sqref="${range('H')}">`
    + `<formula1>&quot;Talking head,Slide voiceover,Screen capture&quot;</formula1></dataValidation>`
    + '</dataValidations>');

fs.writeFileSync(sheetFile, head + out.join('') + tail);

// Drop the now-orphaned comment part along with its relationships and content type.
const relFile = path.join(stage, 'xl', 'worksheets', '_rels', 'sheet3.xml.rels');
fs.writeFileSync(relFile, fs.readFileSync(relFile, 'utf8')
  .replace(/<Relationship[^>]*Type="[^"]*\/comments"[^>]*\/>/, '')
  .replace(/<Relationship[^>]*Type="[^"]*\/vmlDrawing"[^>]*\/>/, ''));
const ctFile = path.join(stage, '[Content_Types].xml');
fs.writeFileSync(ctFile, fs.readFileSync(ctFile, 'utf8')
  .replace(/<Override[^>]*PartName="\/xl\/comments2\.xml"[^>]*\/>/, ''));
for (const f of ['xl/comments2.xml', 'xl/drawings/vmlDrawing2.vml']) {
  fs.rmSync(path.join(stage, f), { force: true });
}

sst.write(countStringCells(stage));

fs.mkdirSync(outDir, { recursive: true });
const safe = course.title.replace(/[\\/:*?"<>|]/g, '-');
const outFile = path.join(outDir, `${safe} - Coursera Import.xlsx`);
zipDir(stage, outFile);
fs.rmSync(stage, { recursive: true, force: true });

const lessons = course.modules.reduce((a, m) => a + m.lessons.length, 0);
console.log(`${path.basename(outFile)}`);
console.log(`  ${course.modules.length} modules · ${lessons} lessons · ${allItems.length} items · ${ivqTotal} IVQs`);
console.log(`  ${Object.entries(typeCounts).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`  total ${Math.floor(totalMin / 60)}h ${totalMin % 60}m · item rows ${itemFirst}-${itemLast}`);
