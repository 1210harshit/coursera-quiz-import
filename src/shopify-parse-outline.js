// Parser for the Complete Shopify Dropshipping outline — quiz-pipeline side.
//
// The first source NOT on the Starweaver "PART 1 / Module N / Title of the Module:" template.
// This one is laid out as a design document:
//
//   ┌ PART 2 — MODULE-BY-MODULE PLAN ┐                       single-cell table
//   ┌ MODULE 1 OF 4  |  LO1          ┐                       single-cell table, three
//   │ Foundations: Set Up Your …     │                       paragraphs: id line, module
//   │ Learner goal: …                ┘                       name, learner goal
//   <module description paragraph>
//   📊 Module 1 contents: 5 lessons · 26 videos · …
//   Lesson 1.1 — The Essentials  (Section 1)                 paragraph, number and name
//   ┌ #     │ Video Title │ Description ┐                    the lesson's videos
//   │ 1.1.1 │ Introduction│ …           ┘
//   ┌ Type  │ Activity    │ Duration    ┐                    the lesson's reading and
//   │ Reading │ …         │ 8 min       ┘                    practice quiz
//
// Video numbers are dotted (1.1.1 = module 1, lesson 1, video 1), which is the same grammar
// paid-ads-11 uses in its "Source video" line, so the M<x>L<y>V<z> key falls straight out.
// The quiz states its mapping the same way, and google-ads' index is published here too so the
// title beside each code can be checked.
//
// Two things this template does not have, both warned about rather than invented:
//   * no Lead Instructor line at all
//   * no per-video duration; only "Total Video Runtime ~9 hours" for 97 videos, and a
//     production note that every video runs 4-8 minutes
const path = require('path');
const { readBlocks, clean } = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'shopify';
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

const VIDEO_HEADER = cells => /^#$/.test(clean(cells[0] || '')) && /^Video Title$/i.test(clean(cells[1] || ''));
const ACTIVITY_HEADER = cells => /^Type$/i.test(clean(cells[0] || '')) && /^Activity$/i.test(clean(cells[1] || ''));

let mod = null, les = null, part = 0;

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    if (!t) continue;
    let m;
    // "Lesson 1.1 — The Essentials  (Section 1)" — the section number is a production
    // reference to the original video course, not part of the lesson name.
    if ((m = t.match(/^Lesson\s+(\d+)\.(\d+)\s*[—–-]\s*(.+?)(?:\s*\(Section\s*\d+\))?$/i))) {
      if (/Practice Quiz$/i.test(m[3])) continue;            // the practice-quiz row, not a heading
      mod = +m[1]; les = +m[2];
      meta['M' + mod] = meta['M' + mod] || { title: '', lessons: {} };
      meta['M' + mod].lessons[les] = meta['M' + mod].lessons[les] || { title: clean(m[3]) };
      meta['M' + mod].lessons[les].title = clean(m[3]);
      continue;
    }
    continue;
  }

  // ---- tables ----
  const rows = b.rows;
  if (!rows.length) continue;

  // Single-cell banner tables carry the part headings and the module headings.
  if (rows.length === 1 && rows[0].length === 1) {
    const cell = rows[0][0] || '';
    const lines = cell.split('\n').map(clean).filter(Boolean);
    let m;
    if ((m = (lines[0] || '').match(/^PART\s*(\d+)/i))) { part = +m[1]; continue; }
    if ((m = (lines[0] || '').match(/^MODULE\s+(\d+)\s+OF\s+\d+\s*\|\s*(LO\d+)/i))) {
      mod = +m[1]; les = null;
      meta['M' + mod] = meta['M' + mod] || { title: '', lessons: {} };
      meta['M' + mod].title = lines[1] || '';
      meta['M' + mod].alignedLO = m[2].toUpperCase();
      if (!meta['M' + mod].title) warn.push(`Module ${mod}: the heading block has no name line`);
      continue;
    }
    continue;
  }

  // "Course at a Glance" and the objectives table are two-column key/value blocks.
  for (const cells of rows) {
    if (cells.length < 2) continue;
    const k = clean(cells[0]), v = clean(cells[1]);
    if (/^Course Title$/i.test(k)) course.title = v;
    else if (/^Subtitle$/i.test(k)) course.subtitle = v;
    else if (/^Graded Questions/i.test(k)) {
      const n = v.match(/(\d+)/);
      if (n) course.quizClaimedQuestions = +n[1];
    } else if (/^(LO\d+)$/i.test(k)) course.los[k.toUpperCase()] = v;
  }

  if (part === 1) continue;                                  // nothing else in Part 1 is needed

  if (VIDEO_HEADER(rows[0])) {
    if (!mod || !les) { warn.push('a video table sits outside any lesson — skipped'); continue; }
    for (const cells of rows.slice(1)) {
      const num = clean(cells[0] || '');
      const title = clean(cells[1] || '');
      const dm = num.match(/^(\d+)\.(\d+)\.(\d+)$/);
      if (!dm) { warn.push(`M${mod}L${les}: unreadable video number "${num}"`); continue; }
      if (+dm[1] !== mod || +dm[2] !== les) {
        warn.push(`video ${num} sits under Lesson ${mod}.${les} — its own number disagrees`);
      }
      const key = `M${dm[1]}L${dm[2]}V${dm[3]}`;
      if (map[key]) { warn.push(`duplicate ${key}: "${title}" ignored`); continue; }
      if (!title) { warn.push(`${key}: no video title`); continue; }
      map[key] = {
        video: title,
        module: +dm[1], lesson: +dm[2],
        moduleTitle: (meta['M' + dm[1]] || {}).title || '',
        lessonTitle: ((meta['M' + dm[1]] || { lessons: {} }).lessons[+dm[2]] || {}).title || '',
      };
      (index[norm(title)] = index[norm(title)] || []).push(key);
    }
    continue;
  }

  // The module-end activity table states the graded quiz's own time budget.
  if (ACTIVITY_HEADER(rows[0])) {
    for (const cells of rows.slice(1)) {
      if (!/^Graded Quiz$/i.test(clean(cells[0] || ''))) continue;
      const mm = clean(cells[2] || '').match(/(\d+)\s*min/i);
      if (mm) course.quizMinutes = (course.quizMinutes || 0) + +mm[1];
    }
  }
}

if (!course.instructor) {
  warn.push('this outline has no Lead Instructor line — the Guide Section will show an empty instructor');
}
const notes = [];
for (const [t, keys] of Object.entries(index)) {
  if (keys.length > 1) notes.push(`"${t}" is the title of ${keys.length} videos: ${keys.join(', ')}`);
}
if (notes.length) {
  warn.push(`${notes.length} video titles are shared by more than one video — a title-based `
    + 'mapping would be ambiguous. This course maps by code, so they are listed as notes below.');
}
for (const [k, m] of Object.entries(meta)) {
  if (!m.title) warn.push(`${k}: no module name`);
  if (!m.alignedLO) warn.push(`${k}: no aligned learning objective`);
  else if (!course.los[m.alignedLO]) warn.push(`${k}: aligned objective ${m.alignedLO} has no text in Part 1`);
  for (const [n, l] of Object.entries(m.lessons)) if (!l.title) warn.push(`${k} Lesson ${n}: no lesson name`);
}
if (course.quizMinutes === null) warn.push('no Graded Quiz duration found — the quiz time estimate will be derived');

if (process.argv.includes('--report')) {
  console.log(`${course.title}`);
  for (const k of Object.keys(meta).sort((a, b) => +a.slice(1) - +b.slice(1))) {
    const vids = Object.keys(map).filter(v => v.startsWith(k + 'L'));
    console.log(`  ${k} — ${meta[k].title}  [${meta[k].alignedLO}]  `
      + `${Object.keys(meta[k].lessons).length} lessons, ${vids.length} videos`);
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
