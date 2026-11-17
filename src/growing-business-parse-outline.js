// Parser for the Growing and Transforming Your Business outline — quiz-pipeline side.
// Emits outline.json: the M<x>L<y>V<z> -> video-title map the builder puts in every reference,
// plus module and lesson titles and the course-level metadata.
//
// One course per document, so there is no Course-N scoping. The heading grammar is its own:
//
//   MODULE 1 — Spotting and Choosing the Right Growth Move     <- uppercase, EM DASH
//   Title of the Module: Spotting and Choosing the Right Growth Move
//   Lesson 1 — Choosing the Right Growth Strategy for Your Business   <- title inline, no
//                                                                        "Title of the Lesson"
//   Aligned Learning Objective: LO1 — Evaluate and select the right growth strategy …
//
// The module name is therefore stated twice, on the MODULE heading and on the "Title of the
// Module:" line below it, and the two disagree in places — module 2 is "Funding, Financing,
// and Scaling…" on the heading and "Funding, Financing and Scaling…" (no serial comma) on the
// title line. The title line wins, because it is the field whose only job is to name the
// module, and the disagreement is reported rather than silently resolved.
//
// V-numbering is STATED, not derived: every instructional row is labelled "Video 1", "Video 2"
// or "Video 3". Two kinds of row deliberately take no number:
//
//   * "Intro Video", the module opener. It is not instructional and the quiz never cites one.
//   * the course-level welcome, wrap-up and promo videos, which sit in the "Introduction to
//     Entire Course" and "Supplementary Items for Entire Course" tables. Those leave lesson
//     scope, so their rows cannot be numbered even though they are labelled "Video 1".
//
// The result is checked rather than assumed: 36 numbered videos, three in each of twelve
// lessons, against the 36 distinct codes the four graded quizzes cite between them.
const path = require('path');
const { readBlocks, isItemHeader, cellText, clean } = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'growing-business';
const blocks = readBlocks(path.join(SP, SLUG, 'outline', 'word', 'document.xml'));

const map = {};        // "M1L1V1" -> {video, module, lesson, moduleTitle, lessonTitle}
const meta = {};       // "M1"     -> {title, lessons:{1:{title}}, alignedLO}
const index = {};      // normalised video title -> [key, ...]
const course = {
  title: '', subtitle: '', instructor: '', instructorIsPlaceholder: false,
  los: {}, quizMinutes: null, quizClaimedQuestions: null,
};
const warn = [];

// Matching-only normalisation: case, curly quotes, dashes, ampersands and inner spacing.
// Deliberately lossy — never write the result back into a document.
const norm = s => clean(String(s))
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/\s*&\s*/g, ' and ')
  .replace(/[.,:;]+$/, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

// Exactly "Video <n>". "Intro Video" and "Promo Video" are not instructional rows, and the
// readings, DPQs, lab and role play share these tables and must not consume a number either.
const videoNumber = label => {
  const m = clean(label || '').match(/^Video\s*(\d+)$/i);
  return m ? +m[1] : null;
};

let mod = null, les = null, scope = 'course';
const lessonVideoCount = {};

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    if (!t) continue;
    let m;

    if ((m = t.match(/^Course Title\s*:\s*(.+)$/i)))    { course.title = m[1].trim(); continue; }
    if ((m = t.match(/^Course Subtitle\s*:\s*(.+)$/i))) { course.subtitle = m[1].trim(); continue; }
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i))) {
      course.instructor = m[1].trim();
      if (/^\[.*\]$/.test(course.instructor)) {
        course.instructorIsPlaceholder = true;
        warn.push(`Lead Instructor is still the placeholder "${course.instructor}" — fill it in before publishing`);
      }
      continue;
    }
    // "LO1: Select the right growth strategy …" — stated in full, before any module.
    if (!mod && (m = t.match(/^(LO\d+)\s*[:\-–—]\s*(.+)$/i))) {
      course.los[m[1].toUpperCase()] = m[2].trim();
      continue;
    }

    // Course-level sections hold tables belonging to no lesson. Leaving lesson scope here is
    // what stops the welcome, wrap-up and promo videos being numbered as lesson videos.
    if (/^Introduction to (the )?Entire Course/i.test(t)) { scope = 'intro'; mod = les = null; continue; }
    if (/^Supplementary Items/i.test(t))                  { scope = 'supplementary'; mod = les = null; continue; }

    // "MODULE 1 — Title", and also "Module 1: Title" so a later revision reads without a change.
    if ((m = t.match(/^MODULE\s+(\d+)\s*[:\-–—]\s*(.+)$/i))) {
      scope = 'lesson'; mod = +m[1]; les = null;
      meta['M' + mod] = meta['M' + mod] || { title: '', lessons: {} };
      meta['M' + mod].headingTitle = m[2].trim();
      if (!meta['M' + mod].title) meta['M' + mod].title = m[2].trim();
      continue;
    }
    // The authoritative module name. Overrides the heading, and a disagreement is reported.
    if ((m = t.match(/^Title of the Module\s*:\s*(.+)$/i)) && mod) {
      const stated = m[1].trim();
      const heading = meta['M' + mod].headingTitle;
      if (heading && norm(heading) !== norm(stated)) {
        warn.push(`M${mod}: the MODULE heading says "${heading}" but "Title of the Module:" says `
          + `"${stated}" — the title line is used`);
      }
      meta['M' + mod].title = stated;
      continue;
    }
    if ((m = t.match(/^Lesson\s+(\d+)\s*[:\-–—]\s*(.+)$/i)) && mod) {
      les = +m[1];
      meta['M' + mod].lessons[les] = meta['M' + mod].lessons[les] || { title: '' };
      meta['M' + mod].lessons[les].title = m[2].trim();
      continue;
    }
    // "Aligned Learning Objective: LO1 — <text>". Only the id is kept; the wording comes from
    // the course-level list so there is one source of truth for it.
    if ((m = t.match(/^Aligned Learning Objectives?\s*:\s*(LO\d+(?:\s*[,;&]\s*(?:and\s+)?LO\d+)*)/i)) && mod) {
      const ids = m[1].match(/LO\d+/gi).map(s => s.toUpperCase());
      meta['M' + mod].alignedLOs = ids;
      meta['M' + mod].alignedLO = ids[0];
      continue;
    }
    continue;
  }

  // ---- learning-items tables ----
  const rows = b.rows.filter(r => r.length >= 2);
  if (!rows.length || !isItemHeader(rows[0])) continue;

  // The supplementary Graded Quiz row states the whole quiz's budget and the question count it
  // covers ("40 multiple-choice questions …" / "60 mins"), which lets the per-module time
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
    const v = videoNumber(cellText(cells[0]));
    if (v === null) continue;                     // Intro Video, Reading, DPQ, lab, role play
    const title = cellText(cells[1]).split('\n')[0].trim();
    const key = `M${mod}L${les}V${v}`;
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

// The module title can be set after a lesson's videos are read, so the copies stored on each
// mapping are refreshed once the whole outline is in.
for (const v of Object.values(map)) {
  v.moduleTitle = meta['M' + v.module].title;
  v.lessonTitle = (meta['M' + v.module].lessons[v.lesson] || {}).title || v.lessonTitle;
}
for (const mm of Object.values(meta)) delete mm.headingTitle;

// --- checks -------------------------------------------------------------------------------
{
  const bad = Object.entries(lessonVideoCount).filter(([, n]) => n !== 3);
  if (bad.length) {
    warn.push(`${bad.length} lesson(s) do not hold exactly three numbered videos: `
      + bad.map(([k, n]) => `${k}=${n}`).join(', ')
      + '. The outline plans three per lesson across twelve lessons; a different count means a '
      + 'quiz may cite a video this map does not carry.');
  }
  for (const [k, n] of Object.entries(lessonVideoCount)) {
    for (let v = 1; v <= n; v++) if (!map[`${k}V${v}`]) warn.push(`${k}: no video numbered V${v}`);
  }
}
for (const [k, m] of Object.entries(meta)) {
  if (!m.title) warn.push(`${k}: no module title`);
  if (!m.alignedLO) warn.push(`${k}: no aligned learning objective`);
  else for (const lo of (m.alignedLOs || [m.alignedLO])) {
    if (!course.los[lo]) warn.push(`${k}: aligned objective ${lo} has no text in the course header`);
  }
  for (const [n, l] of Object.entries(m.lessons)) {
    if (!l.title) warn.push(`${k} Lesson ${n}: no lesson title`);
  }
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
  warn.push('no Graded Quiz row in Supplementary Items — the quiz time estimate will be derived');
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
  if (course.instructor) console.log(`Lead Instructor: ${course.instructor}`);
  for (const k of Object.keys(meta).sort((a, b) => +a.slice(1) - +b.slice(1))) {
    const vids = Object.keys(map).filter(v => v.startsWith(k + 'L'));
    console.log(`  ${k} — ${meta[k].title}  [${(meta[k].alignedLOs || [meta[k].alignedLO]).join(', ')}]  `
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
