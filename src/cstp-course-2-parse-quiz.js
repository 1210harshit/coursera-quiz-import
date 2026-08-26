// Parser for the CSTP Course 2 graded assessment (Communication & Storytelling for Technology
// Professionals — Course 2: Storytelling and Influence in Technical Environments).
//
// Paragraph-based. Its own shape:
//
//   Module 1: The Strategic Power of Story
//   Graded Assessment (GA) — 10 Questions
//   Question 1
//   Mapped to: M1L1V1   |   Bloom's: Understand
//   Scenario: A team must present a platform upgrade …          <- optional, own paragraph
//   Using the three-act model, how should the update be structured?
//   a) Present the components in order of build difficulty      <- LOWERCASE letter, ")" not "."
//   b) …  c) …  d) …
//   ✅ Correct Answer: C                                         <- UPPERCASE letter
//   Incorrect (a): Build difficulty is an internal ordering …   <- the letter is in the LABEL,
//   Incorrect (b): …                                               so explanations are keyed by
//   Correct (c): …                                                 it rather than by position
//   Incorrect (d): …
//
// Notes:
//
//   * options are labelled "a)" and the key is stated "A", so the two are compared
//     case-insensitively and stored uppercase.
//   * the explanation label states both the verdict and the letter. That makes the verdict a
//     second statement of the key, checked against the "Correct Answer" line rather than
//     trusted. The label is consumed, so nothing needs stripping from the text.
//   * a scenario is its own paragraph, so a scenario question has a TWO-LINE prompt. Both
//     lines are kept, in source order — the split is the author's. The builder drops only the
//     leading "Scenario:" label, without which the importer reads the line as an answer option.
//   * "Question 10" is written across runs as "Question " + "10  ". Concatenation and a trim
//     handle it; no special case is needed.
//   * a running "CSTP – Course 2" header paragraph sits between modules and is ignored.
//
// Content passes through with only leading and trailing whitespace removed.
const fs = require('fs');
const path = require('path');
const { lines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'cstp-course-2';

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n` +
    'Module titles and the reference line come from the outline, scoped to Course 2:\n' +
    `  node src/cstp-course-2-parse-outline.js > ${outlinePath}`);
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
let cur = null, q = null, mode = null;

function pushQ() {
  if (!q) return;
  if (!cur) { warn.push(`question ${q.sourceNum} before any module heading — dropped`); q = null; return; }

  const parts = q._prompt.map(verbatim).filter(Boolean);
  q.prompt = parts.length === 1 ? parts[0] : parts;
  q.hasScenario = /^\s*Scenario\s*:/i.test(parts[0] || '');
  delete q._prompt;

  q.num = cur.questions.length + 1;
  const where = `M${cur.num} Q${q.num}`;

  const promptLines = Array.isArray(q.prompt) ? q.prompt : [q.prompt];
  if (!promptLines.filter(Boolean).length) warn.push(`${where}: no prompt`);
  if (q.sourceNum !== null && q.sourceNum !== q.num) {
    warn.push(`${where}: the document numbers it Question ${q.sourceNum} but it sits at position ${q.num}`);
  }
  if (q.options.length !== 4) warn.push(`${where}: ${q.options.length} options`);
  if (!q.correct) warn.push(`${where}: no "Correct Answer" line`);
  else if (!q.options.some(o => o.letter === q.correct)) {
    warn.push(`${where}: key is ${q.correct} but there is no option ${q.correct}`);
  }

  const missing = q.options.map(o => o.letter).filter(L => !q.feedback[L]);
  if (missing.length) warn.push(`${where}: no explanation for ${missing.join(', ')}`);

  // Each explanation states its own verdict, so the set of them states the key a second time.
  if (q.correctExplFor.length !== 1) {
    warn.push(`${where}: ${q.correctExplFor.length} explanations are labelled "Correct" `
      + `(${q.correctExplFor.join(', ') || 'none'})`);
  } else if (q.correct && q.correctExplFor[0] !== q.correct) {
    warn.push(`${where}: the answer key says ${q.correct} but the "Correct (…)" explanation is `
      + `on ${q.correctExplFor[0]}`);
  }

  if (!q.bloom) warn.push(`${where}: no Bloom's level`);

  if (!q.mapped) warn.push(`${where}: no "Mapped to" line`);
  else {
    if (!VIDEOS[q.mapped]) warn.push(`${where}: mapped to ${q.mapped}, which Course 2's outline has no video for`);
    if (!q.mapped.startsWith(`M${cur.num}L`)) {
      warn.push(`${where}: mapped to ${q.mapped}, which is outside module ${cur.num}`);
    }
  }

  // The builder drops a leading "Scenario:" from the first line only.
  promptLines.forEach((line, i) => {
    const text = i === 0 ? String(line).replace(/^\s*Scenario\s*:\s*/i, '') : line;
    const label = /^([A-Za-z][A-Za-z ]{0,24}):\s/.exec(text);
    if (label && !/\s/.test(label[1])) {
      warn.push(`${where}: prompt line ${i + 1} starts with a one-word label, which the importer `
        + `reads as an answer option: "${text.slice(0, 40)}"`);
    }
  });

  delete q.correctExplFor;
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
    mode = null;
    continue;
  }
  if (/^Graded Assessment/i.test(line)) continue;            // the per-module banner
  if (/^CSTP\b/i.test(line)) continue;                        // the running page header

  if ((m = line.match(/^Question\s+(\d+)\s*$/i))) {
    pushQ();
    q = { num: 0, sourceNum: +m[1], prompt: '', _prompt: [], options: [], correct: null,
          correctExplFor: [], feedback: {}, mapped: '', bloom: '', hasScenario: false };
    mode = 'head';
    continue;
  }
  if (!q) continue;

  if ((m = line.match(/^Mapped to\s*:\s*(M\d+L\d+V\d+)\s*(?:\|\s*Bloom'?s\s*:\s*(.+))?$/i))) {
    q.mapped = m[1].toUpperCase();
    if (m[2]) q.bloom = clean(m[2]);
    continue;
  }
  if ((m = line.match(/^\s*(?:✅\s*)?Correct Answer\s*:\s*\(?([A-Da-d])\)?\b/i))) {
    q.correct = m[1].toUpperCase();
    continue;
  }
  // "Correct (c): <text>" / "Incorrect (a): <text>" — the letter is in the label.
  if ((m = line.match(/^(Correct|Incorrect)\s*\(([A-Da-d])\)\s*:\s*([\s\S]*)$/i))) {
    const L = m[2].toUpperCase();
    if (q.feedback[L]) warn.push(`M${cur ? cur.num : '?'} Q${q.sourceNum}: two explanations for option ${L}`);
    q.feedback[L] = verbatim(m[3]);
    if (/^correct$/i.test(m[1])) q.correctExplFor.push(L);
    mode = 'fb';
    continue;
  }
  // "a) <option text>"
  if ((m = line.match(/^([A-Da-d])\)\s*([\s\S]*)$/))) {
    q.options.push({ letter: m[1].toUpperCase(), text: verbatim(m[2]) });
    mode = 'opts';
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
  warn.push(`M${cur ? cur.num : '?'} Q${q.sourceNum}: unplaced line "${line.slice(0, 50)}"`);
}
pushQ();

if (process.argv.includes('--report')) {
  modules.forEach(mo => {
    const lessons = new Set(mo.questions.map(x => (x.mapped.match(/^M\d+(L\d+)/) || [])[1]).filter(Boolean));
    const scen = mo.questions.filter(x => x.hasScenario).length;
    console.log(`Module ${mo.num} — ${mo.title}: ${mo.questions.length} questions, `
      + `${lessons.size} lessons covered, ${scen} scenario-framed`);
  });
  const all = modules.flatMap(mo => mo.questions);
  console.log(`\n${modules.length} modules · ${all.length} questions · `
    + `${all.filter(x => x.mapped).length} mapped · `
    + `${all.reduce((a, x) => a + Object.keys(x.feedback).length, 0)} explanations · `
    + `${all.filter(x => x.hasScenario).length} scenarios`);
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
