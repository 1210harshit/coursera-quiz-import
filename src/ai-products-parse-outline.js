// Parser for the AI-Powered Products for Product Managers outline — quiz-pipeline side.
// Emits outline.json: the M<x>L<y>V<z> -> video-title map the builder puts in every feedback
// reference, plus module/lesson titles and the course-level metadata.
//
// Heading grammar is the bare "Module N" / "Lesson N" form with the name on a following
// "Title of the Module:" line, as in genai-pm, cstp-course-1 and ai-toolkit. What is new here
// is the learning-items table, which has FIVE columns and no "Learning Items" label column:
//
//   | Learning Item Title      | Video Format | High level Description        | Est. Time | Link |
//   | Module Introduction      | Talking Head | Introduction to the module, … | 2 mins    |      |
//   | How AI Products Differ … | Conceptual   | Explains the core differences | 5-7 mins  |      |
//
// Every other course states its video number in that missing column ("Video 1"), so the
// M<x>L<y>V<z> key fell straight out of the label. Here nothing states it, and the key has to
// be DERIVED by counting video rows within the lesson. Two rules make that derivation match
// what the quiz actually references:
//
//   * only a row whose Video Format is a video format counts. Reading, Discussion,
//     Activity/Exercise and Interactive rows sit in the same tables and must not consume a
//     number. VIDEO_FORMAT below is the test.
//   * "Module Introduction" is NOT numbered. Part 1 promises "18 In-Video Questions (1 from
//     each instructional video)" against 20 video rows, and the two unnumbered ones are
//     exactly the two module introductions. The quiz agrees: its lowest reference in each
//     lesson 1 is V1 = the row AFTER the introduction. Counting the introduction would shift
//     every reference in lesson 1 by one and point those questions at the wrong video.
//     The exclusion is reported every run so the assumption stays visible.
//
// The lesson-3 tables carry a SECOND header row partway down, after which come the module's
// readings, DPQ, hands-on lab and role play. Those are module-level items, not lesson videos,
// so the repeated header ENDS video numbering for that table rather than being skipped as
// noise — otherwise a Reading row could take a V number if its format column ever changed.
const path = require('path');
const { readBlocks, clean } = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'ai-products';
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

// The header of a learning-items table in this template. Used both to skip the header and to
// detect the second one, which separates a lesson's videos from the module's own items.
const isItemHeader = cells =>
  /^Learning Item Title$/i.test(clean(cells[0] || '')) && /^Video Format$/i.test(clean(cells[1] || ''));

// The "Video Format" column doubles as the item-kind column in this template: a video row
// names a production format, everything else names its Coursera item kind. Only the formats
// below produce a numbered video.
const VIDEO_FORMAT = f =>
  /^(talking\s*head|conceptual|demo|screenshare|screen\s*capture|slides?|interview|animation)\b/i
    .test(clean(f || ''));

// Not an instructional video: it introduces the module rather than teaching a topic, carries
// no IVQ, and is excluded from V-numbering. See the header comment.
const isModuleIntro = t => /^module\s+introduction$/i.test(clean(t || ''));

let mod = null, les = null, inPart2 = false, scope = 'course';
const introSkipped = [];

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    if (!t) continue;
    let m;

    if ((m = t.match(/^Course Title\s*[:;]\s*(.+)$/i)))      { course.title = m[1].trim(); continue; }
    // This outline writes "Course Subtitle - …" where most others use a colon, as genai-pm does.
    if ((m = t.match(/^Course Subtitle\s*[-–—:]\s*(.+)$/i))) { course.subtitle = m[1].trim(); continue; }
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i))) {
      course.instructor = m[1].trim();
      // Kept verbatim rather than blanked if it is still the template placeholder: the only
      // place it appears is the human-facing Guide Section, where "[Lead Instructor Name]"
      // reads as the TODO it is, and blank would read as an omission.
      if (/^\[.*\]$/.test(course.instructor)) {
        course.instructorIsPlaceholder = true;
        warn.push(`Lead Instructor is still the placeholder "${course.instructor}" — fill it in before publishing`);
      }
      continue;
    }
    if (!inPart2 && (m = t.match(/^(LO\d+)\s*(?:\([^)]*\))?\s*[:\-–]\s*(.+)$/i))) {
      course.los[m[1].toUpperCase()] = m[2].trim();
      continue;
    }

    if (/^PART\s*2\b/i.test(t)) { inPart2 = true; scope = 'course'; mod = les = null; continue; }
    if (/^PART\s*3\b/i.test(t)) break;
    if (!inPart2) continue;

    // Course-level sections hold tables that belong to no lesson. Leaving module/lesson scope
    // here is what stops the Supplementary wrap-up video being numbered as a lesson video.
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
    // States only the id ("LO1"); the objective text lives in Part 1. The plural form and a
    // comma-separated list are accepted so a later revision aligning two objectives to one
    // module reads without a change here.
    if ((m = t.match(/^Aligned Learning Objectives?\s*:\s*(LO\d+(?:\s*[,;&]\s*(?:and\s+)?LO\d+)*)/i)) && mod) {
      const ids = m[1].match(/LO\d+/gi).map(s => s.toUpperCase());
      meta['M' + mod].alignedLOs = ids;
      meta['M' + mod].alignedLO = ids[0];
      continue;
    }
    continue;
  }

  // ---- tables ----
  if (!inPart2) continue;

  // The Graded Quiz row of the supplementary table states the whole quiz's time budget and the
  // question count that budget covers, which lets the per-module estimate be derived rather
  // than assumed. Five columns here, so the time is cells[3] and the claim cells[2].
  if (scope === 'supplementary') {
    for (const cells of b.rows) {
      if (cells.length < 4 || !/^Graded Quiz$/i.test(clean(cells[0]))) continue;
      const est = clean(cells[3]);
      const range = est.match(/(\d+)\s*[-–—]\s*(\d+)\s*min/i);
      const one = est.match(/(\d+)\s*min/i);
      if (range) course.quizMinutes = Math.round((+range[1] + +range[2]) / 2);
      else if (one) course.quizMinutes = +one[1];
      const qq = clean(cells[2]).match(/(\d+)\s*(?:multiple[- ]choice\s*)?questions?\b/i);
      if (qq) course.quizClaimedQuestions = +qq[1];
    }
    continue;
  }

  if (scope !== 'lesson' || !mod || !les) continue;

  let v = 0, done = false;
  for (const [i, cells] of b.rows.entries()) {
    if (cells.length < 2) continue;
    if (isItemHeader(cells)) {
      // The first header opens the table. A second one ends the lesson's videos: what follows
      // are the module's readings, DPQ, lab and role play.
      if (i > 0) done = true;
      continue;
    }
    if (done) continue;

    const title = clean(cells[0]);
    const format = clean(cells[1]);
    if (!VIDEO_FORMAT(format)) continue;            // Reading, Discussion, Activity/Exercise, Interactive
    if (isModuleIntro(title)) { introSkipped.push(`M${mod}L${les}`); continue; }

    const key = `M${mod}L${les}V${++v}`;
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

// The V-numbers above are derived, not stated, so the one assumption behind them is reported
// every run rather than left in a comment. See the header.
if (introSkipped.length) {
  warn.push(`"Module Introduction" is not counted as a video in ${introSkipped.join(', ')} — V1 in `
    + `each is the row after it. Part 1 promises 18 IVQs "1 from each instructional video" against `
    + `${Object.keys(map).length + introSkipped.length} video rows, and the quiz's own references `
    + 'agree. Check this first if a reference points one video too early.');
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
  if (!m.title) warn.push(`${k}: no "Title of the Module" line`);
  if (!m.alignedLO) warn.push(`${k}: no aligned learning objective`);
  else for (const lo of (m.alignedLOs || [m.alignedLO])) {
    if (!course.los[lo]) warn.push(`${k}: aligned objective ${lo} has no text in Part 1`);
  }
  for (const [n, l] of Object.entries(m.lessons)) {
    if (!l.title) warn.push(`${k} Lesson ${n}: no "Title of the Lesson" line`);
  }
}
// Five objectives, two modules, one aligned each: LO3-LO5 are course-level promises no module
// claims. Legal — nothing here assumes a 1:1 mapping — but it is the kind of gap a reviewer
// wants named, because the course description promises outcomes no module is accountable for.
{
  const aligned = new Set(Object.values(meta).flatMap(m => m.alignedLOs || [m.alignedLO]).filter(Boolean));
  const orphans = Object.keys(course.los).filter(lo => !aligned.has(lo));
  if (orphans.length) {
    warn.push(`${orphans.join(', ')} ${orphans.length > 1 ? 'are' : 'is'} stated in Part 1 but aligned `
      + 'to no module — the course promises outcomes no module is accountable for');
  }
}
if (course.quizMinutes === null) {
  warn.push('no Graded Quiz row in Supplementary Items — quiz time estimate will be derived');
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
