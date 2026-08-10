// Parser for the Google Ads for Performance Marketers graded quiz.
//
// This source is the first in the repository to lay its questions out as TABLES rather than
// paragraphs. One <w:tbl> per question, seven rows, label in column 1:
//
//   Q.        | 1. <prompt>
//   A.        | <option text>
//   B.        | <option text>
//   C.        | <option text>
//   D.        | <option text>
//   Correct   | B. <the correct option's text, repeated in full>
//   Feedback  | <one explanation for the whole question>
//
// Four consequences, each handled below:
//
//   * The mapping is not a code. An italic "Source video: <title>" paragraph sits above each
//     table, so titles are resolved to M<x>L<y>V<z> through the `index` that
//     google-ads-parse-outline.js publishes. Run that parser FIRST.
//   * Question numbers run 1-80 across the whole document, not 1-10 per module. They are
//     renumbered per module (Coursera imports one document per module and each must start at
//     "Question 1"); the document's own number is kept as `sourceNum` for traceability.
//   * There is ONE explanation per question, not one per option. It is repeated across all
//     four options, which is what a learner sees either way — Coursera shows the feedback for
//     whichever option they picked, and this source only ever explains why the key is right.
//     `feedbackShared` records that this happened rather than hiding it.
//   * The document ends with an 81st table that repeats question 40 verbatim, after question
//     80. Any source number seen twice is dropped with a warning.
const fs = require('fs');
const path = require('path');
const { readBlocks, clean } = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'google-ads';
const blocks = readBlocks(path.join(SP, SLUG, 'quiz', 'word', 'document.xml'));

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n` +
    'This quiz states its mapping as a video title, so the outline must be parsed first:\n' +
    `  node src/google-ads-parse-outline.js > ${outlinePath}`);
  process.exit(1);
}
const { index: TITLE_INDEX, map: VIDEOS } = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

// Must stay identical to norm() in google-ads-parse-outline.js — the two sides of the lookup.
const norm = s => clean(String(s))
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/\s*&\s*/g, ' and ')
  .replace(/[.,:;]+$/, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

// Source-side typos in the "Source video:" line, keyed by the exact text the quiz writes.
// Only single, verified transcription slips belong here — never a judgement call about which
// video a question ought to reference. Each fixup still warns, so the substitution is visible.
const TITLE_FIXUPS = {
  // Quiz drops the plural; the outline's video is "Conversions From Phone Calls" (M6L2V1).
  'Conversion From Phone Calls': 'Conversions From Phone Calls',
};

// Deliberate overrides of a *resolved* mapping, keyed by "M<module> Q<number-in-module>".
// Empty by design: the one question that needs a decision is M4 Q10 (the document's Q40,
// "Performance Planner"). That video is taught in module 8, not module 4, so the question
// forward-references content the learner has not reached. Leaving the mapping at M8L3V1
// keeps the reference factually right and the warning loud; re-pointing it at module 4's
// nearest video ("Keyword Planner", M4L4V4) would make it factually wrong. Moving the
// question to module 8 is the editorial fix, and belongs in the source document.
//   e.g. 'M4 Q10': 'M4L4V4',
const MAPPING_OVERRIDE = {};

const ROW_LABEL = /^(Q|Correct|Feedback|[A-D])\s*[.:]?\s*$/i;
const modules = [];
const warn = [];
const seenSourceNums = new Map();     // source question number -> "M1 Q3", for the duplicate check

let cur = null;            // current module
let pendingVideo = null;   // the "Source video:" line waiting for its table

function resolveVideo(rawTitle, where) {
  if (!rawTitle) { warn.push(`${where}: no "Source video" line above the question`); return ''; }
  let title = rawTitle;
  if (TITLE_FIXUPS[title]) {
    warn.push(`${where}: source video "${title}" corrected to "${TITLE_FIXUPS[title]}" (typo in the quiz)`);
    title = TITLE_FIXUPS[title];
  }
  const keys = TITLE_INDEX[norm(title)];
  if (!keys || !keys.length) { warn.push(`${where}: source video "${title}" is not in the outline`); return ''; }
  if (keys.length > 1) {
    warn.push(`${where}: source video "${title}" matches ${keys.join(', ')} — took the first`);
  }
  return keys[0];
}

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    if (!t) continue;
    let m;
    if ((m = t.match(/^Module\s+(\d+)\s*[—–-]\s*(.+)$/i))) {
      cur = { num: +m[1], title: clean(m[2]), questions: [] };
      modules.push(cur);
      pendingVideo = null;
      continue;
    }
    if ((m = t.match(/^Source video\s*:\s*([\s\S]+)$/i))) { pendingVideo = clean(m[1]); continue; }
    continue;
  }

  // ---- a question table ----
  const rows = b.rows.filter(r => r.length >= 2 && ROW_LABEL.test(clean(r[0])));
  if (rows.length < 3) continue;                    // not a question table
  if (!cur) { warn.push(`question table before any module heading — skipped`); continue; }

  const q = { num: 0, sourceNum: null, prompt: '', options: [], correct: null,
              feedback: {}, feedbackShared: true, mapped: '', sourceVideo: pendingVideo || '' };
  let correctCell = '';

  for (const cells of rows) {
    const label = clean(cells[0]).replace(/[.:]\s*$/, '').toUpperCase();
    const value = (cells[1] || '').split('\n').map(clean).filter(Boolean);
    if (label === 'Q') {
      // "12. How does Broad Match differ …" — the number is the document's own running count.
      const first = value[0] || '';
      const nm = first.match(/^(\d+)\s*[.)]\s*(.*)$/);
      if (nm) { q.sourceNum = +nm[1]; value[0] = nm[2]; } else value[0] = first;
      q.prompt = value.length > 1 ? value.slice() : (value[0] || '');
    } else if (/^[A-D]$/.test(label)) {
      q.options.push({ letter: label, text: value.join(' ') });
    } else if (label === 'CORRECT') {
      correctCell = value.join(' ');
      const cm = correctCell.match(/^\(?([A-D])\)?\s*[.):]?\s+/);
      if (cm) q.correct = cm[1].toUpperCase();
    } else if (label === 'FEEDBACK') {
      const fb = value.join(' ');
      for (const L of ['A', 'B', 'C', 'D']) q.feedback[L] = fb;
    }
  }

  const where = `M${cur.num} src-Q${q.sourceNum === null ? '?' : q.sourceNum}`;

  if (q.sourceNum !== null && seenSourceNums.has(q.sourceNum)) {
    warn.push(`${where}: duplicate of ${seenSourceNums.get(q.sourceNum)} — dropped`);
    pendingVideo = null;
    continue;
  }

  q.mapped = resolveVideo(q.sourceVideo, where);

  // Structural checks. Each one is a reason the importer would reject the question, so they
  // are surfaced here rather than discovered in Coursera's error log.
  if (!q.prompt || (Array.isArray(q.prompt) && !q.prompt.length)) warn.push(`${where}: no prompt`);
  if (q.sourceNum === null) warn.push(`${where}: prompt does not start with a question number`);
  if (q.options.length !== 4) warn.push(`${where}: ${q.options.length} options`);
  if (!q.correct) warn.push(`${where}: no correct answer letter in the Correct row: "${correctCell.slice(0, 40)}"`);
  if (!Object.values(q.feedback).some(Boolean)) warn.push(`${where}: no feedback`);

  // The Correct row repeats the winning option in full. When the two disagree the source has
  // been edited on one side only, and the answer key can no longer be trusted.
  if (q.correct) {
    const opt = q.options.find(o => o.letter === q.correct);
    if (!opt) warn.push(`${where}: key is ${q.correct} but there is no option ${q.correct}`);
    else {
      const restated = correctCell.replace(/^\(?[A-D]\)?\s*[.):]?\s+/, '');
      if (norm(restated) !== norm(opt.text)) {
        warn.push(`${where}: Correct row text differs from option ${q.correct}\n` +
          `      correct row: ${restated.slice(0, 70)}\n      option ${q.correct}:     ${opt.text.slice(0, 70)}`);
      }
    }
  }

  // A prompt line beginning "Word: " is read by the importer as an answer option.
  for (const line of (Array.isArray(q.prompt) ? q.prompt : [q.prompt])) {
    if (/^[A-Za-z][A-Za-z ]{0,24}:\s/.test(line)) {
      warn.push(`${where}: prompt starts with a label-like token: "${String(line).slice(0, 40)}"`);
    }
  }

  q.num = cur.questions.length + 1;
  const tag = `M${cur.num} Q${q.num}`;
  if (MAPPING_OVERRIDE[tag]) {
    warn.push(`${tag}: mapping overridden ${q.mapped || '(none)'} -> ${MAPPING_OVERRIDE[tag]}`);
    q.mapped = MAPPING_OVERRIDE[tag];
  }
  if (q.mapped && !VIDEOS[q.mapped]) warn.push(`${tag}: mapping ${q.mapped} has no video in the outline`);
  if (q.sourceNum !== null) seenSourceNums.set(q.sourceNum, tag);
  cur.questions.push(q);
  pendingVideo = null;
}

for (const mo of modules) {
  const lessons = new Set(mo.questions.map(q => (q.mapped.match(/^M\d+(L\d+)/) || [])[1]).filter(Boolean));
  // A question whose video lives in another module forward- or back-references content the
  // learner meets elsewhere. Always an editorial decision, never something to silently repair.
  for (const q of mo.questions.filter(q => q.mapped && !q.mapped.startsWith(`M${mo.num}L`))) {
    warn.push(`M${mo.num} Q${q.num} (source Q${q.sourceNum}): its source video "${q.sourceVideo}" is `
      + `${q.mapped}, taught in module ${q.mapped.match(/^M(\d+)/)[1]}, not module ${mo.num} — `
      + 'the feedback will point outside this module. Move the question in the source, or set '
      + 'MAPPING_OVERRIDE.');
  }
  mo.lessonsCovered = lessons.size;
}

if (process.argv.includes('--report')) {
  modules.forEach(mo => {
    const shared = mo.questions.filter(q => q.feedbackShared).length;
    console.log(`Module ${mo.num} — ${mo.title}: ${mo.questions.length} questions, `
      + `${mo.lessonsCovered} lessons covered, ${shared} with one shared explanation`);
  });
  const all = modules.flatMap(m => m.questions);
  console.log(`\n${modules.length} modules · ${all.length} questions · `
    + `${all.filter(q => q.mapped).length} mapped to a video`);
  const byLetter = {};
  for (const q of all) byLetter[q.correct] = (byLetter[q.correct] || 0) + 1;
  console.log('answer key spread: ' + Object.entries(byLetter).sort().map(([k, v]) => `${k}:${v}`).join(' '));
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify(modules, null, 2));
}

// Keep VIDEOS referenced so a stale outline.json (index without map) fails here rather than
// three stages later inside the builder.
if (!VIDEOS || !Object.keys(VIDEOS).length) {
  console.error('WARN outline.json has no video map — the builder will not be able to write reference lines');
}
