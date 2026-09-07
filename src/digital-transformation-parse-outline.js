// Parser for the Digital Transformation program outline — quiz-pipeline side, COURSE 1 only.
// Emits outline.json: the M<x>L<y>V<z> -> video-title map the builder puts in every feedback
// reference, plus module/lesson titles and the course-level metadata.
//
// Heading grammar is cstp-course-1's: bare "Module N" / "Lesson N" with the name on a following
// "Title of the Module:" / "Title of the Lesson:" line, and ONE DOCUMENT HOLDING FOUR COURSES,
// so capture runs from "Course 1" to "Course 2". The graded quiz covers Course 1 — its own
// header says "Course Name: Digital Transformation Foundation and Strategy", which is Course 1's
// title, and every mapping it states falls inside M1-M3.
//
// The one thing that is genuinely new is the TABLES, and it is why this parser reads its blocks
// from lib-outline-nested rather than lib-outline-course: this outline nests its learning-items
// tables up to three deep, which the shared reader's non-greedy `<w:tbl>…</w:tbl>` match cannot
// see. Against the shared reader the nine lesson tables read as 177 truncated fragments with
// most rows leaking out as loose paragraphs; against the depth-aware one they read as 44 clean
// six-column tables. See the header of lib-outline-nested.js. On a source without nesting the
// two readers return byte-identical blocks, so nothing else in this parser is unusual.
//
// V-numbering is stated, not derived — every instructional row is labelled "Video 1", "Video 2"
// or "Video 3" — which is the safe case. Two kinds of row deliberately take no number:
//
//   * "Intro Video" (titled "Module Introduction"), the module opener. It is not an
//     instructional video and the quiz never references one; the exact-match test on
//     "Video <n>" is what keeps it out.
//   * the course-level welcome and wrap-up videos, which sit in the "Introduction to Course 1"
//     and "Supplementary Items for Course 1" tables. Those leave lesson scope, so their rows
//     cannot be numbered even though one of them is labelled "Video 1".
//
// The result is checked rather than assumed: 27 numbered videos, three in each of nine lessons,
// against the 27 distinct codes the quiz cites.
//
// Two source quirks, both shared with cstp-course-1:
//   * "C1LO1:" and "C1LO3:" state the id and leave the text to the FOLLOWING paragraph, while
//     "C1LO2:" carries its text after a line break in the same one. Both forms are read.
//   * "Aligned Course-level Learning Objective: C1LO1 -" likewise trails off, with the text on
//     the next paragraph. Only the id is needed here, so the trailing form costs nothing.
const path = require('path');
const { readBlocks, isItemHeader, cellText, clean } = require('./lib-outline-nested');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'digital-transformation';
const blocks = readBlocks(path.join(SP, SLUG, 'outline', 'word', 'document.xml'));

const map = {};        // "M1L1V1" -> {video, module, lesson, moduleTitle, lessonTitle}
const meta = {};       // "M1"     -> {title, lessons:{1:{title}}, alignedLO}
const index = {};      // normalised video title -> [key, ...]
const course = {
  title: '', subtitle: '', instructor: '', instructorIsPlaceholder: false,
  los: {}, quizMinutes: null, quizClaimedQuestions: null,
};
const warn = [];

const norm = s => clean(String(s))
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/\s*&\s*/g, ' and ')
  .replace(/[.,:;]+$/, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

// Exactly "Video <n>". "Intro Video" and a bare "Video" are not instructional rows.
const videoNumber = label => {
  const m = clean(label || '').match(/^Video\s*(\d+)$/i);
  return m ? +m[1] : null;
};

let inCourse1 = false, scope = 'course', mod = null, les = null;
let awaitTitle = null;             // 'module' | 'lesson' — whose Title-of line comes next
let awaitLO = null;                // "C1LO2" — its text is on the following paragraph
const lessonVideoCount = {};

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    if (!t) continue;
    let m;

    // Stated once for the whole program, above the Course 1 heading.
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i)) && !course.instructor) {
      course.instructor = m[1].trim();
      if (/^\[.*\]$/.test(course.instructor)) course.instructorIsPlaceholder = true;
      continue;
    }

    if (/^Course\s*1\s*$/i.test(t)) { inCourse1 = true; scope = 'course'; mod = les = null; continue; }
    if (/^Course\s*[2-9]\d*\s*$/i.test(t)) break;              // Course 1 only
    if (!inCourse1) continue;

    if ((m = t.match(/^Title of the Course\s*:\s*(.+)$/i))) { course.title = m[1].trim(); continue; }

    // "C1LO2: <text>" — or the id alone, with the text on the next paragraph. paraText turns a
    // <w:br/> into a newline, so the inline form arrives as "C1LO2: \nDesign customer-…".
    if ((m = t.match(/^(?:•\s*)?(C1LO\d+)\s*:\s*([\s\S]*)$/i))) {
      const id = m[1].toUpperCase(), text = m[2].replace(/\s+/g, ' ').trim();
      if (text) { course.los[id] = text; awaitLO = null; }
      else { course.los[id] = ''; awaitLO = id; }
      continue;
    }
    if (awaitLO && !/^(?:•\s*)?(Aligned|Module\s+\d|Lesson\s+\d|Title of|Description|Learning Objectives)/i.test(t)) {
      course.los[awaitLO] = t.replace(/^•\s*/, '').replace(/\s+/g, ' ').trim();
      awaitLO = null;
      continue;
    }

    if (/^Introduction to Course/i.test(t))  { scope = 'intro'; mod = les = null; awaitTitle = null; continue; }
    if (/^Supplementary Items/i.test(t))     { scope = 'supplementary'; mod = les = null; awaitTitle = null; continue; }

    if ((m = t.match(/^Module\s+(\d+)\s*$/i))) {
      scope = 'lesson'; mod = +m[1]; les = null; awaitTitle = 'module';
      meta['M' + mod] = meta['M' + mod] || { title: '', lessons: {} };
      continue;
    }
    if ((m = t.match(/^Title of the Module\s*:\s*(.*)$/i)) && mod) {
      if (m[1].trim()) meta['M' + mod].title = m[1].trim();
      else warn.push(`M${mod}: "Title of the Module:" line is empty`);
      awaitTitle = null;
      continue;
    }
    if ((m = t.match(/^Lesson\s+(\d+)\s*$/i)) && mod) {
      les = +m[1]; awaitTitle = 'lesson';
      meta['M' + mod].lessons[les] = meta['M' + mod].lessons[les] || { title: '' };
      continue;
    }
    if ((m = t.match(/^Title of the Lesson\s*:\s*(.*)$/i)) && mod && les) {
      if (m[1].trim()) meta['M' + mod].lessons[les].title = m[1].trim();
      else warn.push(`M${mod} Lesson ${les}: "Title of the Lesson:" line is empty`);
      awaitTitle = null;
      continue;
    }
    // "Aligned Course-level Learning Objective: C1LO2 - <text>", or the id with the text on the
    // next paragraph. Only the id is used, so either form is fine.
    if ((m = t.match(/^Aligned Course-level Learning Objectives?\s*:\s*(C1LO\d+(?:\s*[,;&]\s*(?:and\s+)?C1LO\d+)*)/i)) && mod) {
      const ids = m[1].match(/C1LO\d+/gi).map(s => s.toUpperCase());
      meta['M' + mod].alignedLOs = ids;
      meta['M' + mod].alignedLO = ids[0];
      continue;
    }
    continue;
  }

  // ---- tables ----
  if (!inCourse1) continue;
  const rows = b.rows.filter(r => r.length >= 2);
  if (!rows.length || !isItemHeader(rows[0])) continue;

  // The supplementary Graded Quiz row states the whole quiz's budget and the question count it
  // covers ("30 questions, 10 from each module" / "60 mins"), which lets the per-module time
  // estimate be derived rather than assumed.
  if (scope === 'supplementary') {
    for (const cells of rows.slice(1)) {
      if (!/^Graded Quiz$/i.test(clean(cellText(cells[0])))) continue;
      const est = clean(cellText(cells[4] || ''));
      const range = est.match(/(\d+)\s*[-–—]\s*(\d+)\s*min/i);
      const one = est.match(/(\d+)\s*min/i);
      if (range) course.quizMinutes = Math.round((+range[1] + +range[2]) / 2);
      else if (one) course.quizMinutes = +one[1];
      const qq = clean(cellText(cells[3] || '')).match(/(\d+)\s*(?:multiple[- ]choice\s*)?questions?\b/i);
      if (qq) course.quizClaimedQuestions = +qq[1];
    }
    continue;
  }

  if (scope !== 'lesson' || !mod || !les) continue;

  let seen = 0;
  for (const cells of rows.slice(1)) {
    const n = videoNumber(cellText(cells[0]));
    if (n === null) continue;                         // Intro Video, Reading, DPQ, lab, role play
    const title = cellText(cells[1]).split('\n')[0].trim();
    const key = `M${mod}L${les}V${n}`;
    seen++;
    if (map[key]) { warn.push(`duplicate ${key}: "${title}" ignored`); continue; }
    if (!title) { warn.push(`${key}: no Learning Item Title in source`); continue; }
    map[key] = {
      video: title,
      module: mod, lesson: les,
      moduleTitle: meta['M' + mod].title,
      lessonTitle: meta['M' + mod].lessons[les].title,
    };
    (index[norm(title)] = index[norm(title)] || []).push(key);
  }
  lessonVideoCount[`M${mod}L${les}`] = seen;
}

// --- checks -----------------------------------------------------------------------------
{
  const bad = Object.entries(lessonVideoCount).filter(([, n]) => n !== 3);
  if (bad.length) {
    warn.push(`${bad.length} lesson(s) do not hold exactly three numbered videos: `
      + bad.map(([k, n]) => `${k}=${n}`).join(', ')
      + '. The outline plans three per lesson across nine lessons; a different count means the '
      + 'quiz may reference a video this map does not carry.');
  }
  // Numbering is stated, but a gap in it would still leave a hole the quiz could reference.
  for (const [k, n] of Object.entries(lessonVideoCount)) {
    for (let v = 1; v <= n; v++) if (!map[`${k}V${v}`]) warn.push(`${k}: no video numbered V${v}`);
  }
}
for (const [k, m] of Object.entries(meta)) {
  if (!m.title) warn.push(`${k}: no module title`);
  if (!m.alignedLO) warn.push(`${k}: no aligned course-level learning objective`);
  else for (const lo of (m.alignedLOs || [m.alignedLO])) {
    if (!course.los[lo]) warn.push(`${k}: aligned objective ${lo} has no text in the course header`);
  }
  for (const [n, l] of Object.entries(m.lessons)) {
    if (!l.title) warn.push(`${k} Lesson ${n}: no lesson title`);
  }
}
for (const [id, text] of Object.entries(course.los)) {
  if (!text) warn.push(`${id} is stated with no objective text`);
}
{
  const aligned = new Set(Object.values(meta).flatMap(m => m.alignedLOs || [m.alignedLO]).filter(Boolean));
  const orphans = Object.keys(course.los).filter(lo => !aligned.has(lo));
  if (orphans.length) {
    warn.push(`${orphans.join(', ')} ${orphans.length > 1 ? 'are' : 'is'} stated for the course but `
      + 'aligned to no module');
  }
}
if (!course.instructor) warn.push('no "Lead Instructor:" line in the outline');
if (course.quizMinutes === null) {
  warn.push('no Graded Quiz row in Supplementary Items — quiz time estimate will be derived');
}

const notes = [];
for (const [t, keys] of Object.entries(index)) {
  if (keys.length > 1) notes.push(`"${t}" is the title of ${keys.length} videos: ${keys.join(', ')}`);
}
if (notes.length) {
  notes.unshift(`${notes.length} video titles are shared by more than one video — a title-based `
    + 'mapping would be ambiguous. This course maps by code, so they are listed as notes.');
}

if (process.argv.includes('--report')) {
  console.log(`${course.title}`);
  for (const k of Object.keys(meta).sort((a, b) => +a.slice(1) - +b.slice(1))) {
    const vids = Object.keys(map).filter(v => v.startsWith(k + 'L'));
    console.log(`  ${k} — ${meta[k].title}  [${(meta[k].alignedLOs || [meta[k].alignedLO]).join(', ')}]  `
      + `${Object.keys(meta[k].lessons).length} lessons, ${vids.length} videos`);
    for (const v of vids) console.log(`      ${v}  ${map[v].video}`);
  }
  console.log(`\n${Object.keys(meta).length} modules · ${Object.keys(map).length} mapped videos · `
    + `${Object.keys(course.los).length} course objectives · `
    + `quiz budget ${course.quizMinutes} mins for ${course.quizClaimedQuestions} questions`);
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
  if (notes.length) { console.log(`\nnotes: ${notes.length}`); notes.forEach(n => console.log('  ' + n)); }
} else {
  warn.forEach(w => console.error('WARN ' + w));
  notes.forEach(n => console.error('NOTE ' + n));
  console.log(JSON.stringify({ map, meta, index, course }, null, 2));
}
