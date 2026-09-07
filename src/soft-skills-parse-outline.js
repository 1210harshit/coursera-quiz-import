// Parser for the Soft Skills for Work and Life outline — quiz-pipeline side.
// Emits outline.json: the M<x>L<y>V<z> -> video-title map the builder puts in every feedback
// reference, plus module/lesson titles and the course-level metadata.
//
// Heading grammar is genai-marketing's inline form — "Module N: Title" and "Lesson N: Title"
// carry the name on the heading itself, with no "Title of the Module:" line to follow.
//
// The V-numbering problem is ai-products'. This outline DOES have a "Learning Items" label
// column, but every instructional row is labelled with the bare word "Video" — no number. So
// the M<x>L<y>V<z> key has to be DERIVED by counting video rows within the lesson. Three
// things make that derivation safe here, and all three are checked rather than assumed:
//
//   * only a row labelled exactly "Video" is numbered. "Video Intro" and "Video Outro" are the
//     course-level welcome and wrap-up; they sit in the "Introduction to the Entire Course" and
//     "Supplementary Items" tables, which are outside lesson scope anyway, but the exact-match
//     test means neither could take a number even if the outline moved them.
//   * every lesson holds exactly two of them. Part 1 promises "16 Topic Videos at 5 Minutes
//     Each" and "two five-minute topic videos" per lesson against 4 modules x 2 lessons, and the
//     table reader confirms 2 per lesson on every run. A lesson that reads 1 or 3 is reported.
//   * the quiz's own references agree: every M<x>L<y>V<z> the four graded quizzes cite resolves
//     to a key produced here, inside its own module. The quiz parser checks that.
//
// Unlike ai-products there is no "Module Introduction" row to exclude, which is what made that
// course's numbering fragile — here nothing sits between the lesson header and its first video.
//
// Two deviations from genai-marketing's source shape:
//
//   * there is no "Lead Instructor:" line at all. The Guide Section of every built document
//     names an instructor, so a placeholder is emitted and warned about rather than left blank —
//     "[Lead Instructor Name]" reads as the TODO it is, where blank reads as an omission.
//   * "Aligned Learning Objective:" states the objective in FULL, module-specific wording rather
//     than naming an id ("LO2"). The builder wants the id, so the text is resolved back to a
//     Part 1 objective by its opening verb, which is unique across LO1-LO4 here (Analyze,
//     Demonstrate, Apply, Construct). A resolution that is not unique is reported, never guessed.
const path = require('path');
const { readBlocks, isItemHeader, cellText, clean } = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'soft-skills';
const blocks = readBlocks(path.join(SP, SLUG, 'outline', 'word', 'document.xml'));

const map = {};        // "M1L1V1" -> {video, module, lesson, moduleTitle, lessonTitle}
const meta = {};       // "M1"     -> {title, lessons:{1:{title}}, alignedLO}
const index = {};      // normalised video title -> [key, ...]
const course = {
  title: '', subtitle: '', instructor: '', instructorIsPlaceholder: false,
  los: {}, quizMinutes: null, quizClaimedQuestions: null,
};
const warn = [];

const INSTRUCTOR_PLACEHOLDER = '[Lead Instructor Name]';

// Matching-only normalisation: case, curly quotes, dashes, ampersands and inner spacing.
// Deliberately lossy — never write the result back into a document.
const norm = s => clean(String(s))
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/\s*&\s*/g, ' and ')
  .replace(/[.,:;]+$/, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

// Exactly "Video". "Video Intro" and "Video Outro" are course-level and must not be numbered;
// Reading, Practice Quiz, Coach Dialogue, Discussion Prompt, Hands-on Lab, Roleplay and
// Graded Assessment share these tables and must not consume a number either.
const isLessonVideo = label => /^video$/i.test(clean(label || ''));

// "A ten-question graded quiz drawing on every video in the module" -> 10.
const WORD_NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
};
function questionCount(desc) {
  const t = clean(desc || '');
  const digits = t.match(/(\d+)[-\s]question/i);
  if (digits) return +digits[1];
  const word = t.match(/\b([a-z]+)[-\s]question/i);
  if (word && WORD_NUM[word[1].toLowerCase()]) return WORD_NUM[word[1].toLowerCase()];
  return null;
}

let mod = null, les = null, inPart2 = false, scope = 'course';
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
      if (/^\[.*\]$/.test(course.instructor)) course.instructorIsPlaceholder = true;
      continue;
    }
    // Part 1 states each objective in full: "LO1: Analyze the ten soft skills…".
    if (!inPart2 && (m = t.match(/^(LO\d+)\s*(?:\([^)]*\))?\s*[:\-–]\s*(.+)$/i))) {
      course.los[m[1].toUpperCase()] = m[2].trim();
      continue;
    }

    if (/^Part\s*2\b/i.test(t)) { inPart2 = true; scope = 'course'; mod = les = null; continue; }
    // This outline has no Part 3; the appendices close it.
    if (/^Appendix\s*:/i.test(t)) break;
    if (!inPart2) continue;

    // Course-level sections hold tables that belong to no lesson. Leaving module/lesson scope
    // here is what stops the wrap-up video being numbered as a lesson video.
    if (/^(Pathway Gate|Introduction to (the )?Entire Course|Supplementary Items|Closing Items)/i.test(t)) {
      scope = /^Supplementary/i.test(t) ? 'supplementary' : 'other';
      mod = les = null;
      continue;
    }

    if ((m = t.match(/^Module\s+(\d+)\s*:\s*(.+)$/i))) {
      scope = 'lesson'; mod = +m[1]; les = null;
      meta['M' + mod] = meta['M' + mod] || { title: '', lessons: {} };
      meta['M' + mod].title = m[2].trim();
      continue;
    }
    if ((m = t.match(/^Lesson\s+(\d+)\s*:\s*(.+)$/i)) && mod) {
      les = +m[1];
      meta['M' + mod].lessons[les] = meta['M' + mod].lessons[les] || { title: '' };
      meta['M' + mod].lessons[les].title = m[2].trim();
      continue;
    }
    // Stated in full here, not as an id. Resolved to a Part 1 objective below.
    if ((m = t.match(/^Aligned Learning Objectives?\s*:\s*(.+)$/i)) && mod) {
      meta['M' + mod].alignedText = m[1].trim();
      continue;
    }
    continue;
  }

  // ---- tables ----
  if (!inPart2) continue;
  const rows = b.rows.filter(r => r.length >= 2);
  if (!rows.length || !isItemHeader(rows[0])) continue;

  // Each module's graded assessment states its own time budget and question count, which lets
  // the built document's time estimate be derived rather than assumed.
  for (const cells of rows.slice(1)) {
    if (!/^Graded Assessment$/i.test(clean(cellText(cells[0])))) continue;
    const mins = clean(cellText(cells[4] || '')).match(/(\d+)\s*min/i);
    const qs = questionCount(cellText(cells[3] || ''));
    if (mins) {
      if (course.quizMinutes !== null && course.quizMinutes !== +mins[1]) {
        warn.push(`graded assessments disagree on time budget: ${course.quizMinutes} vs ${mins[1]} mins`);
      }
      course.quizMinutes = +mins[1];
    }
    if (qs) {
      if (course.quizClaimedQuestions !== null && course.quizClaimedQuestions !== qs) {
        warn.push(`graded assessments disagree on question count: ${course.quizClaimedQuestions} vs ${qs}`);
      }
      course.quizClaimedQuestions = qs;
    }
  }

  if (scope !== 'lesson' || !mod || !les) continue;

  let v = 0;
  for (const cells of rows.slice(1)) {
    if (!isLessonVideo(cellText(cells[0]))) continue;
    const title = cellText(cells[1]).split('\n')[0].trim();
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
  lessonVideoCount[`M${mod}L${les}`] = v;
}

// --- resolve each module's full-text aligned objective to a Part 1 id --------------------
// The opening verb is what distinguishes LO1-LO4 here. Requiring a UNIQUE match means a later
// revision that reuses a verb is reported rather than silently aligned to the wrong objective.
for (const [k, m] of Object.entries(meta)) {
  if (!m.alignedText) { warn.push(`${k}: no "Aligned Learning Objective" line`); continue; }
  const verb = (m.alignedText.match(/^([A-Za-z]+)/) || [null, ''])[1].toLowerCase();
  const hits = Object.keys(course.los)
    .filter(lo => course.los[lo].toLowerCase().startsWith(verb + ' '));
  if (hits.length === 1) {
    m.alignedLO = hits[0];
    m.alignedLOs = [hits[0]];
  } else {
    warn.push(`${k}: aligned objective "${m.alignedText.slice(0, 48)}…" opens "${verb}", which matches `
      + `${hits.length} Part 1 objectives (${hits.join(', ') || 'none'}) — not resolved to an LO id`);
  }
}

// --- the derived V-numbers are an assumption; report it whenever it does not hold ---------
{
  const bad = Object.entries(lessonVideoCount).filter(([, n]) => n !== 2);
  if (bad.length) {
    warn.push(`${bad.length} lesson(s) do not hold exactly two videos: `
      + bad.map(([k, n]) => `${k}=${n}`).join(', ')
      + '. V-numbers are derived by counting "Video" rows within the lesson, so an unexpected '
      + 'count means every reference after it may point at the wrong video.');
  }
}

const notes = [];
for (const [t, keys] of Object.entries(index)) {
  if (keys.length > 1) notes.push(`"${t}" is the title of ${keys.length} videos: ${keys.join(', ')}`);
}
if (notes.length) {
  notes.unshift(`${notes.length} video titles are shared by more than one video — a title-based `
    + 'mapping would be ambiguous. This course maps by code, so they are listed as notes.');
}

if (!course.instructor) {
  course.instructor = INSTRUCTOR_PLACEHOLDER;
  course.instructorIsPlaceholder = true;
  warn.push('no "Lead Instructor:" line in the outline — the Guide Section of every built '
    + `document will read "${INSTRUCTOR_PLACEHOLDER}". Fill it in before publishing.`);
} else if (course.instructorIsPlaceholder) {
  warn.push(`Lead Instructor is still the placeholder "${course.instructor}" — fill it in before publishing`);
}

for (const [k, m] of Object.entries(meta)) {
  if (!m.title) warn.push(`${k}: no module title on the heading`);
  for (const [n, l] of Object.entries(m.lessons)) {
    if (!l.title) warn.push(`${k} Lesson ${n}: no lesson title on the heading`);
  }
}
{
  const aligned = new Set(Object.values(meta).map(m => m.alignedLO).filter(Boolean));
  const orphans = Object.keys(course.los).filter(lo => !aligned.has(lo));
  if (orphans.length) {
    warn.push(`${orphans.join(', ')} ${orphans.length > 1 ? 'are' : 'is'} stated in Part 1 but aligned `
      + 'to no module — the course promises outcomes no module is accountable for');
  }
}
if (course.quizMinutes === null) {
  warn.push('no Graded Assessment row states a time budget — quiz time estimate will be derived');
}

if (process.argv.includes('--report')) {
  console.log(`${course.title}`);
  for (const k of Object.keys(meta).sort((a, b) => +a.slice(1) - +b.slice(1))) {
    const vids = Object.keys(map).filter(v => v.startsWith(k + 'L'));
    console.log(`  ${k} — ${meta[k].title}  [${meta[k].alignedLO || 'unresolved'}]  `
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
