// Re-open a generated course-import .xlsx and check it against course.json and against the
// template's own rules.
//
//   node src/course-import-verify.js <slug> [distDir]
//
// This reads the OUTPUT, not the builder's intermediate state — the point is to catch a
// builder regression, so nothing here trusts anything the builder said it did.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { decode } = require('./lib-xlsx');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const slug = process.argv[2];
if (!slug) { console.error('usage: course-import-verify.js <slug> [distDir]'); process.exit(2); }

const distDir = process.argv[3] || path.join(SP, slug, 'dist');
const course = JSON.parse(fs.readFileSync(path.join(SP, slug, 'course.json'), 'utf8'));

const files = fs.readdirSync(distDir).filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'));
if (files.length !== 1) { console.error(`expected exactly one .xlsx in ${distDir}, found ${files.length}`); process.exit(1); }
const target = path.join(distDir, files[0]);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cimport-'));
execFileSync('unzip', ['-q', '-o', target, '-d', tmp]);

const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };

// --- shared strings + FOR IMPORT sheet ---------------------------------------------------
const ssXml = fs.readFileSync(path.join(tmp, 'xl', 'sharedStrings.xml'), 'utf8');
const shared = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)]
  .map(m => decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')));

const sheetXml = fs.readFileSync(path.join(tmp, 'xl', 'worksheets', 'sheet3.xml'), 'utf8');
const rows = {};
for (const m of sheetXml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
  const cells = {};
  for (const c of m[2].matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const col = c[1].match(/r="([A-Z]+)\d+"/)[1];
    const t = (c[1].match(/t="(\w+)"/) || [])[1];
    const v = (c[2] || '').match(/<v>([\s\S]*?)<\/v>/);
    if (!v) continue;
    cells[col] = t === 's' ? shared[+v[1]] : decode(v[1]);
  }
  rows[+m[1]] = cells;
}
const rowNums = Object.keys(rows).map(Number).sort((a, b) => a - b);
const A = n => (rows[n] || {}).A || '';
const B = n => (rows[n] || {}).B || '';

// --- the allow-list the template itself publishes ----------------------------------------
const rangesXml = fs.readFileSync(path.join(tmp, 'xl', 'worksheets', 'sheet4.xml'), 'utf8');
const rangeCells = {};
for (const m of rangesXml.matchAll(/<c\s+r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
  const t = (m[3].match(/t="(\w+)"/) || [])[1];
  const v = (m[4] || '').match(/<v>([\s\S]*?)<\/v>/);
  if (v) rangeCells[m[1] + m[2]] = t === 's' ? shared[+v[1]] : decode(v[1]);
}
const OFFERING_COL = { Private: 'B', Public: 'C', 'Your Org': 'D' };
const offering = B(23);
check(OFFERING_COL[offering], `course offering type "${offering}" is not one of Private / Public / Your Org`);
// Read the whole column: the builder appends rows past the template's own last one for item
// types Coursera added after the template was published.
const allowed = new Set();
const col = OFFERING_COL[offering] || 'B';
for (const [ref, v] of Object.entries(rangeCells)) {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m || m[1] !== col || +m[2] < 3) continue;
  if (v && v !== 'Select an item type') allowed.add(v);
}
check(allowed.size > 0, 'could not read the item-type allow-list from the Ranges sheet');

// Whatever the dropdown offers must be exactly what the Ranges column holds — an appended
// type is useless if the validation range still stops short of it.
const dvRange = sheetXml.match(/<formula1>'Ranges \(Please dont change\)'!\$E\$(\d+):\$E\$(\d+)<\/formula1>/);
check(!!dvRange, 'item-type dropdown does not point at the Ranges sheet');
if (dvRange) {
  const eVals = [];
  for (let r = +dvRange[1]; r <= +dvRange[2]; r++) if (rangeCells['E' + r]) eVals.push(rangeCells['E' + r]);
  for (const t of new Set(course.modules.flatMap(m => m.lessons.flatMap(l => l.items.map(i => i.type))))) {
    check(eVals.includes(t), `item type "${t}" is not inside the dropdown range E${dvRange[1]}:E${dvRange[2]}`);
  }
}

// --- structure ---------------------------------------------------------------------------
check(B(16) === course.title, `title mismatch: sheet "${B(16)}" vs course.json "${course.title}"`);
check(A(15) === 'Course info', 'row 15 is no longer the "Course info" band');
check(!!B(17), 'course description is empty');

const PLACEHOLDERS = ['[Course title goes here]', '[Course description goes here]', '[Module name goes here]',
  '[Module number goes here]', '[Module description goes here]', '[Learning objective goes here]',
  '[Lesson name goes here]', '[Lesson number goes here]', '[Item name goes here]',
  '[Item description goes here]', '[Content link goes here]', '[Notes go here]', '[Write/SME name goes here]'];

const seenModules = [];
let curModule = null, curLesson = null, inItems = false;
const itemRows = [];

for (const n of rowNums) {
  const a = A(n);
  if (a === 'Module')      { curModule = { row: n, number: B(n), lessons: [] }; seenModules.push(curModule); curLesson = null; inItems = false; continue; }
  if (a === 'Lesson')      { curLesson = { row: n, number: B(n) }; if (curModule) curModule.lessons.push(curLesson); inItems = false; continue; }
  if (a === '***Type')     { inItems = true; continue; }
  if (a === '***Name') {
    check(!!B(n) && !PLACEHOLDERS.includes(B(n)), `row ${n}: ***Name is empty or still a placeholder`);
    if (curLesson && !curLesson.name) curLesson.name = B(n);
    else if (curModule && !curModule.name) curModule.name = B(n);
    continue;
  }
  if (a === '— Add as many rows as you need —') { inItems = false; continue; }
  if (inItems && a) itemRows.push(n);
}

check(seenModules.length === course.modules.length,
  `module count: sheet ${seenModules.length}, course.json ${course.modules.length}`);

const expectedLessons = course.modules.reduce((s, m) => s + m.lessons.length, 0);
const sheetLessons = seenModules.reduce((s, m) => s + m.lessons.length, 0);
check(sheetLessons === expectedLessons, `lesson count: sheet ${sheetLessons}, course.json ${expectedLessons}`);

// Lesson numbering restarts at 1 in every module and the name repeats it.
for (const m of seenModules) {
  m.lessons.forEach((l, i) => {
    check(String(l.number) === String(i + 1),
      `module ${m.number}: lesson ${i + 1} carries number "${l.number}"`);
    check(/^Lesson \d+: .+/.test(l.name || ''),
      `module ${m.number} row ${l.row + 1}: lesson name "${l.name}" is not "Lesson N: Title"`);
    check((l.name || '').startsWith(`Lesson ${i + 1}:`),
      `module ${m.number}: lesson name "${l.name}" does not match its position ${i + 1}`);
  });
}

// --- items --------------------------------------------------------------------------------
const jsonItems = course.modules.flatMap(m => m.lessons.flatMap(l => l.items));
check(itemRows.length === jsonItems.length,
  `item count: sheet ${itemRows.length}, course.json ${jsonItems.length}`);

const VIDEO_TYPES = new Set(['Talking head', 'Slide voiceover', 'Screen capture']);
let sheetMinutes = 0, sheetIvq = 0;
const MIN = 1440;

itemRows.forEach((n, i) => {
  const c = rows[n];
  const src = jsonItems[i];
  check(allowed.has(c.A), `row ${n}: item type "${c.A}" is not offered under "${offering}"`);
  check(!!c.B && !PLACEHOLDERS.includes(c.B), `row ${n}: item name empty or placeholder`);
  for (const col of ['B', 'C', 'E', 'F', 'I']) {
    if (c[col] && PLACEHOLDERS.includes(c[col])) fail.push(`row ${n}: column ${col} still holds template placeholder text`);
  }
  const mins = Math.round((+c.D || 0) * MIN);
  sheetMinutes += mins;
  if (src) {
    check(c.A === src.type, `row ${n}: type "${c.A}" vs course.json "${src.type}"`);
    check(c.B === src.name, `row ${n}: name "${c.B}" vs course.json "${src.name}"`);
    check(mins === src.min, `row ${n} "${c.B}": ${mins} mins vs course.json ${src.min}`);
  }
  if (c.G === '1') {
    sheetIvq++;
    check(c.A === 'Video', `row ${n}: IVQ flagged on a "${c.A}" item`);
  }
  if (c.H) {
    check(VIDEO_TYPES.has(c.H), `row ${n}: video type "${c.H}" is not in the dropdown`);
    check(c.A === 'Video', `row ${n}: video type set on a "${c.A}" item`);
  }
  if (c.E) check(/^https?:\/\//i.test(c.E), `row ${n}: link "${c.E}" is not a URL`);
});

const jsonMinutes = jsonItems.reduce((a, i) => a + i.min, 0);
check(sheetMinutes === jsonMinutes, `total time: sheet ${sheetMinutes} mins, course.json ${jsonMinutes}`);
check(Math.round((+B(18) || 0) * MIN) === jsonMinutes,
  `course time estimate B18 = ${Math.round((+B(18) || 0) * MIN)} mins, expected ${jsonMinutes}`);
check(sheetIvq === jsonItems.filter(i => i.ivq).length,
  `IVQ count: sheet ${sheetIvq}, course.json ${jsonItems.filter(i => i.ivq).length}`);

// Module time estimates must equal the sum of their own items.
seenModules.forEach((m, mi) => {
  const declared = Math.round((+B(m.row + 3) || 0) * MIN);
  const expected = (course.modules[mi] || { lessons: [] }).lessons
    .reduce((a, l) => a + l.items.reduce((b, i) => b + i.min, 0), 0);
  check(declared === expected, `module ${m.number}: time estimate ${declared} mins, items total ${expected}`);
});

// --- validation ranges must still cover every item row ------------------------------------
const dv = sheetXml.match(/<dataValidations>[\s\S]*?<\/dataValidations>/);
check(!!dv, 'dataValidations block is missing — the item-type dropdown would be gone');
if (dv) {
  const typeDv = dv[0].match(/<dataValidation[^>]*sqref="([^"]*)"[^>]*>\s*<formula1>'Ranges[^<]*\$E\$\d+:\$E\$\d+<\/formula1>/);
  check(!!typeDv, 'item-type dropdown no longer points at the Ranges sheet');
  if (typeDv) {
    const covered = new Set();
    for (const part of typeDv[1].split(/\s+/)) {
      const r = part.match(/^A(\d+):A(\d+)$/);
      if (r) for (let i = +r[1]; i <= +r[2]; i++) covered.add(i);
    }
    const missing = itemRows.filter(n => !covered.has(n));
    check(missing.length === 0, `${missing.length} item rows outside the dropdown range (first: ${missing[0]})`);
  }
}

// --- package sanity ------------------------------------------------------------------------
const ct = fs.readFileSync(path.join(tmp, '[Content_Types].xml'), 'utf8');
const rels = fs.readFileSync(path.join(tmp, 'xl', 'worksheets', '_rels', 'sheet3.xml.rels'), 'utf8');
check(!/comments2\.xml/.test(ct) || fs.existsSync(path.join(tmp, 'xl', 'comments2.xml')),
  '[Content_Types].xml declares comments2.xml but the part is gone');
for (const m of rels.matchAll(/Target="([^"]*)"[^>]*(?:TargetMode="External")?/g)) {
  if (/^https?:/.test(m[1])) continue;
  const p = path.join(tmp, 'xl', 'worksheets', m[1]);
  check(fs.existsSync(path.normalize(p)), `sheet3 relationship points at a missing part: ${m[1]}`);
}
for (const sheet of ['sheet1', 'sheet2', 'sheet3', 'sheet4']) {
  check(fs.existsSync(path.join(tmp, 'xl', 'worksheets', `${sheet}.xml`)), `${sheet}.xml missing`);
}

fs.rmSync(tmp, { recursive: true, force: true });

if (fail.length) {
  console.error(`\n❌ ${fail.length} problem${fail.length > 1 ? 's' : ''} in ${files[0]}\n`);
  for (const f of fail) console.error('  ' + f);
  process.exit(1);
}
console.log(`✅ ALL CHECKS PASSED — ${files[0]}`);
console.log(`   ${seenModules.length} modules, ${sheetLessons} lessons, ${itemRows.length} items, `
  + `${sheetIvq} IVQs, ${Math.floor(sheetMinutes / 60)}h ${sheetMinutes % 60}m, `
  + `all types valid under "${offering}".`);
