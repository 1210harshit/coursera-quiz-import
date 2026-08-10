// Parser for the Paid Advertising Across 11 Platforms outline (v2) — quiz-pipeline side.
// Emits outline.json: the M<x>L<y>V<z> -> video-title map the builder puts in every
// feedback reference, plus module/lesson titles and the course-level metadata.
//
// Heading grammar is the bare "Module N" / "Lesson N" form with the name on a following
// "Title of the Module:" line, as in cstp-course-1 and ai-toolkit.
//
// Identical to paid-social-parse-outline.js apart from the slug — the two outlines share a
// template. It is kept as its own file for the same reason every course here has its own
// parser: the next revision of either source is free to drift without touching the other.
//
// `index` is a normalised video-title -> M<x>L<y>V<z> lookup. This quiz states its mapping as
// a code, so unlike google-ads it does not need the index to resolve one; the quiz parser uses
// it the other way round, to check that the title the quiz writes beside each code is really
// the title the outline gives that video. `map[key].video` keeps the outline's exact wording,
// which is what the reference line prints.
const path = require('path');
const { readBlocks, clean } = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'paid-ads-11';
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

let mod = null, les = null, inPart2 = false, scope = 'course';

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    if (!t) continue;
    let m;

    if ((m = t.match(/^Course Title\s*[:;]\s*(.+)$/i)))    { course.title = m[1].trim(); continue; }
    if ((m = t.match(/^Course Subtitle\s*:\s*(.+)$/i)))    { course.subtitle = m[1].trim(); continue; }
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i))) {
      course.instructor = m[1].trim();
      // The outline still carries the template placeholder. It is kept verbatim rather than
      // blanked, because the only place it appears is the human-facing Guide Section, where
      // "[Lead Instructor Name]" reads as the TODO it is. Blank would read as an omission.
      if (/^\[.*\]$/.test(course.instructor)) {
        course.instructorIsPlaceholder = true;
        warn.push(`Lead Instructor is still the placeholder "${course.instructor}" — fill it in before publishing`);
      }
      continue;
    }
    if (!inPart2 && (m = t.match(/^(LO\d+)\s*[:\-–]\s*(.+)$/i))) {
      course.los[m[1].toUpperCase()] = m[2].trim();
      continue;
    }

    if (/^PART\s*2\b/i.test(t)) { inPart2 = true; scope = 'course'; mod = les = null; continue; }
    if (/^PART\s*3\b/i.test(t)) break;
    if (!inPart2) continue;

    // Course-level sections hold tables that belong to no lesson. Leaving module/lesson
    // scope here is what stops the Supplementary "Video 1" (the wrap-up) overwriting the
    // last real video of the last lesson.
    if (/^(Introduction to (the )?Entire Course|Supplementary Items|Can each of these modules)/i.test(t)) {
      scope = /^Supplementary/i.test(t) ? 'supplementary' : 'other';
      mod = les = null;
      continue;
    }

    if ((m = t.match(/^Module\s+(\d+)\s*$/i))) {
      scope = 'lesson'; mod = +m[1]; les = null;
      meta['M' + mod] = meta['M' + mod] || { title: '', lessons: {} };
      continue;
    }
    if ((m = t.match(/^Title of the Module\s*:\s*(.+)$/i)) && mod) {
      meta['M' + mod].title = m[1].trim(); continue;
    }
    if ((m = t.match(/^Lesson\s+(\d+)\s*$/i)) && mod) {
      les = +m[1];
      meta['M' + mod].lessons[les] = meta['M' + mod].lessons[les] || { title: '' };
      continue;
    }
    if ((m = t.match(/^Title of the Lesson\s*:\s*(.+)$/i)) && mod && les) {
      meta['M' + mod].lessons[les].title = m[1].trim(); continue;
    }
    // States only the id ("LO1"); the objective text lives in Part 1.
    if ((m = t.match(/^Aligned Learning Objectives?\s*:\s*(LO\d+)/i)) && mod) {
      meta['M' + mod].alignedLO = m[1].toUpperCase(); continue;
    }
    continue;
  }

  // ---- tables ----
  if (!inPart2) continue;

  // The Graded Quiz row of the supplementary table states the whole quiz's time budget and
  // the question count that budget covers, which lets the per-module estimate be derived
  // rather than assumed.
  if (scope === 'supplementary') {
    for (const cells of b.rows) {
      if (cells.length < 5 || !/^Graded Quiz$/i.test(clean(cells[0]))) continue;
      const mm = clean(cells[4]).match(/(\d+)\s*min/i);
      if (mm) course.quizMinutes = +mm[1];
      const qq = clean(cells[3]).match(/(\d+)\s*(?:multiple[- ]choice\s*)?questions?\b/i);
      if (qq) course.quizClaimedQuestions = +qq[1];
    }
    continue;
  }

  if (scope !== 'lesson' || !mod || !les) continue;
  for (const cells of b.rows) {
    if (cells.length < 2) continue;
    const m = clean(cells[0]).match(/^Video\s+(\d+)$/i);
    if (!m) continue;                                  // Intro Video, Reading, DPQ, Hands-on Lab
    const key = `M${mod}L${les}V${m[1]}`;
    const title = clean(cells[1]);
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
}

// Nine platform modules built to one template repeat a lot of video titles ("Section
// Overview", "How To Create Brand Awareness Campaign"). That is only a defect for a quiz that
// maps by title; this one maps by code, so the repeats are reported as notes rather than
// warnings. They still matter — they are exactly the titles a human would misread.
const notes = [];
for (const [t, keys] of Object.entries(index)) {
  if (keys.length > 1) notes.push(`"${t}" is the title of ${keys.length} videos: ${keys.join(', ')}`);
}
if (notes.length) {
  warn.push(`${notes.length} video titles are shared by more than one video — a title-based `
    + 'mapping would be ambiguous. This course maps by code, so they are listed as notes below.');
}
for (const [k, m] of Object.entries(meta)) {
  if (!m.title) warn.push(`${k}: no "Title of the Module" line`);
  if (!m.alignedLO) warn.push(`${k}: no aligned learning objective`);
  else if (!course.los[m.alignedLO]) warn.push(`${k}: aligned objective ${m.alignedLO} has no text in Part 1`);
  for (const [n, l] of Object.entries(m.lessons)) {
    if (!l.title) warn.push(`${k} Lesson ${n}: no "Title of the Lesson" line`);
  }
}
if (course.quizMinutes === null) warn.push('no Graded Quiz row in Supplementary Items — quiz time estimate will be derived');

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
  if (notes.length) {
    console.log(`\nnotes: ${notes.length}`);
    notes.forEach(n => console.log('  ' + n));
  }
} else {
  warn.forEach(w => console.error('WARN ' + w));
  notes.forEach(n => console.error('NOTE ' + n));
  console.log(JSON.stringify({ map, meta, index, course }, null, 2));
}
