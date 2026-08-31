// Parser for the AI and Digital Transformation for Pharma and Biotech graded assessment.
//
// Paragraph-based. Its own shape:
//
//   Module 1: Introduction to AI and Digital Transformation in Pharma and Biotech
//   L1 — AI Fundamentals in Pharma and Biotech                    <- lesson banner
//   Q1. Mapped to: M1L1V1  —  Video 1: Overview of Artificial Intelligence  |  Bloom's: Remember
//   Which statement best defines machine learning, a core AI technology in pharma?
//   A) Algorithms that learn from data to improve predictions automatically
//   B) …  C) …  D) …
//   ✅ Correct Answer: A
//   Feedback                                                      <- a bare header line
//   A) Correct. Machine learning models learn patterns from data …
//   B) Fixed rule-based logic describes traditional expert systems …
//
// Three things follow from that:
//
//   * the question number and the mapping share ONE line, so both come off the same match.
//   * "A)" means an OPTION before the "Feedback" header and an EXPLANATION after it. A mode
//     flag set by that header is what tells them apart; without it the four explanations would
//     be read as four more options.
//   * only the keyed explanation carries a verdict, written bare as "Correct." after the
//     letter. That is a second statement of the key and is checked against the "Correct
//     Answer" line. The builder strips the word; quiz.json keeps the source text.
//
// Questions run 1-40 across the document and are renumbered 1-10 per module.
// The lesson banner is checked against the outline's own lesson title rather than ignored.
//
// Content passes through with only leading and trailing whitespace removed.
const fs = require('fs');
const path = require('path');
const { lines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'pharma';

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n` +
    'The reference line and the mapping cross-check both come from the outline:\n' +
    `  node src/pharma-parse-outline.js > ${outlinePath}`);
  process.exit(1);
}
const { map: VIDEOS, meta: MMETA } = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

const raw = lines(path.join(SP, SLUG, 'quiz', 'word', 'document.xml'));
const clean = s => String(s).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
const verbatim = s => String(s).replace(/ /g, ' ').replace(/^\s+|\s+$/g, '');
const norm = s => clean(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/\s*&\s*/g, ' and ').replace(/[.,:;]+$/, '').replace(/\s+/g, ' ').toLowerCase();

const modules = [];
const warn = [];
let cur = null, q = null, lesson = null, mode = null;

function pushQ() {
  if (!q) return;
  if (!cur) { warn.push(`question ${q.sourceNum} before any module heading — dropped`); q = null; return; }

  const parts = q._prompt.map(verbatim).filter(Boolean);
  q.prompt = parts.length === 1 ? parts[0] : parts;
  delete q._prompt;

  q.num = cur.questions.length + 1;
  const where = `M${cur.num} Q${q.num} (source Q${q.sourceNum})`;

  const promptLines = Array.isArray(q.prompt) ? q.prompt : [q.prompt];
  if (!promptLines.filter(Boolean).length) warn.push(`${where}: no prompt`);
  if (q.options.length !== 4) warn.push(`${where}: ${q.options.length} options`);
  if (!q.correct) warn.push(`${where}: no "Correct Answer" line`);
  else if (!q.options.some(o => o.letter === q.correct)) {
    warn.push(`${where}: key is ${q.correct} but there is no option ${q.correct}`);
  }

  const missing = q.options.map(o => o.letter).filter(L => !q.feedback[L]);
  if (missing.length) warn.push(`${where}: no explanation for ${missing.join(', ')}`);

  // Only the keyed explanation opens "Correct." — a second statement of the key.
  const marked = Object.entries(q.feedback)
    .filter(([, fb]) => /^Correct[.:,!]/i.test(fb)).map(([L]) => L);
  if (marked.length !== 1) {
    warn.push(`${where}: ${marked.length} explanations open with "Correct." (${marked.join(', ') || 'none'})`);
  } else if (q.correct && marked[0] !== q.correct) {
    warn.push(`${where}: the answer key says ${q.correct} but the "Correct." explanation is on ${marked[0]}`);
  }

  if (!q.bloom) warn.push(`${where}: no Bloom's level`);

  if (!q.mapped) warn.push(`${where}: no "Mapped to" code`);
  else {
    const v = VIDEOS[q.mapped];
    if (!v) warn.push(`${where}: mapped to ${q.mapped}, which the outline has no video for`);
    else if (q.mappedTitle) {
      // The quiz writes "Video 1: Overview of Artificial Intelligence"; the outline stores the
      // title alone. Compare on the title, which is the part that names the content.
      const stated = q.mappedTitle.replace(/^Video\s*\d+\s*:\s*/i, '');
      if (norm(stated) !== norm(v.video)) {
        warn.push(`${where}: quiz writes ${q.mapped} as "${stated}" but the outline calls it `
          + `"${v.video}" — the reference line will use the outline's wording`);
      }
    }
    if (!q.mapped.startsWith(`M${cur.num}L`)) {
      warn.push(`${where}: mapped to ${q.mapped}, which is outside module ${cur.num}`);
    }
    // The lesson banner above the question should agree with where the code points.
    if (lesson && !q.mapped.startsWith(`M${cur.num}L${lesson.num}`)) {
      warn.push(`${where}: sits under the "L${lesson.num}" banner but maps to ${q.mapped}`);
    }
  }

  promptLines.forEach((line, i) => {
    const text = i === 0 ? String(line).replace(/^\s*Scenario\s*:\s*/i, '') : line;
    const label = /^([A-Za-z][A-Za-z ]{0,24}):\s/.exec(text);
    if (label && !/\s/.test(label[1])) {
      warn.push(`${where}: prompt line ${i + 1} starts with a one-word label, which the importer `
        + `reads as an answer option: "${text.slice(0, 40)}"`);
    }
  });

  cur.questions.push(q);
  q = null;
}

for (const line of raw) {
  if (!line) continue;
  let m;

  if ((m = line.match(/^Module\s+(\d+)\s*[:—–-]\s*(.+)$/i))) {
    pushQ();
    cur = { num: +m[1], title: clean(m[2]), questions: [] };
    modules.push(cur);
    lesson = null; mode = null;
    continue;
  }
  if (/^Graded Assessment\b/i.test(line) || /^Course\s*:/i.test(line)) continue;

  // "L1 — AI Fundamentals in Pharma and Biotech"
  if ((m = line.match(/^L(\d+)\s*[—–-]\s*(.+)$/i)) && cur) {
    pushQ();
    lesson = { num: +m[1], title: clean(m[2]) };
    const known = ((MMETA['M' + cur.num] || { lessons: {} }).lessons || {})[lesson.num];
    if (known && known.title && norm(known.title) !== norm(lesson.title)) {
      warn.push(`M${cur.num} L${lesson.num}: the quiz calls it "${lesson.title}" but the outline `
        + `calls it "${known.title}"`);
    }
    mode = null;
    continue;
  }

  // "Q1. Mapped to: M1L1V1 — Video 1: Overview of AI | Bloom's: Remember"
  if ((m = line.match(/^Q\s*(\d+)\s*\.\s*Mapped to\s*:\s*(M\d+L\d+V\d+)\s*(?:[—–-]\s*(.*?))?\s*(?:\|\s*Bloom'?s\s*:\s*(.+))?$/i))) {
    pushQ();
    q = { num: 0, sourceNum: +m[1], prompt: '', _prompt: [], options: [], correct: null,
          feedback: {}, mapped: m[2].toUpperCase(), mappedTitle: clean(m[3] || ''),
          bloom: clean(m[4] || '') };
    mode = 'head';
    continue;
  }
  if (/^Q\s*\d+\s*\./.test(line) && !q) { warn.push(`unreadable question line: "${line.slice(0, 70)}"`); continue; }
  if (!q) continue;

  if ((m = line.match(/^\s*(?:✅\s*)?Correct Answer\s*:\s*\(?([A-Da-d])\)?\b/i))) {
    q.correct = m[1].toUpperCase();
    continue;
  }
  // A bare "Feedback" line separates the options above from the explanations below. Without
  // this flag the four explanations would be read as four more options.
  if (/^Feedback\s*:?\s*$/i.test(line)) { mode = 'fb'; continue; }

  if ((m = line.match(/^([A-Da-d])\)\s*([\s\S]*)$/))) {
    const L = m[1].toUpperCase();
    if (mode === 'fb') {
      if (q.feedback[L]) warn.push(`M${cur.num} src-Q${q.sourceNum}: two explanations for option ${L}`);
      q.feedback[L] = verbatim(m[2]);
    } else {
      q.options.push({ letter: L, text: verbatim(m[2]) });
      mode = 'opts';
    }
    continue;
  }

  if (mode === 'head') { q._prompt.push(line); continue; }
  if (mode === 'opts' && q.options.length) {
    q.options[q.options.length - 1].text += ' ' + verbatim(line);
    continue;
  }
  if (mode === 'fb') {
    const last = Object.keys(q.feedback).pop();
    if (last) { q.feedback[last] += ' ' + verbatim(line); continue; }
  }
  warn.push(`M${cur ? cur.num : '?'} src-Q${q.sourceNum}: unplaced line "${line.slice(0, 50)}"`);
}
pushQ();

if (process.argv.includes('--report')) {
  modules.forEach(mo => {
    const lessons = new Set(mo.questions.map(x => (x.mapped.match(/^M\d+(L\d+)/) || [])[1]).filter(Boolean));
    console.log(`Module ${mo.num} — ${mo.title}: ${mo.questions.length} questions, ${lessons.size} lessons covered`);
  });
  const all = modules.flatMap(mo => mo.questions);
  console.log(`\n${modules.length} modules · ${all.length} questions · `
    + `${all.filter(x => x.mapped).length} mapped · `
    + `${all.reduce((a, x) => a + Object.keys(x.feedback).length, 0)} explanations`);
  const spread = o => Object.entries(o).sort().map(([k, v]) => `${k}:${v}`).join(' ');
  const byLetter = {}, byBloom = {};
  for (const x of all) { byLetter[x.correct] = (byLetter[x.correct] || 0) + 1; byBloom[x.bloom] = (byBloom[x.bloom] || 0) + 1; }
  console.log('answer key spread: ' + spread(byLetter));
  console.log("Bloom's levels:    " + spread(byBloom));
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify(modules, null, 2));
}
