// Parser for the HAWS Course 1 graded assessment (Human + AI Partnership: Mindsets,
// Foundations & Real-World Value).
//
// Paragraph-based. ONE document holds every module — work/haws-c1/docs/C1_Graded_Assessment —
// and the parser refuses to run on anything but exactly one, since a second would silently
// double every question. Its shape:
//
//   Module 1: <module title>
//   Q1. <the whole prompt, on the header line>
//   Mapped to: M1L1V1
//   A. <option text>                               <- "A." with a STOP is an OPTION
//   B. …  C. …  D. …
//   ✅ Correct Answer: A
//   Explanation for Option A (Correct):            <- label alone; its text is the NEXT line
//   When qualifications are equal, the behaviours on display are what separate candidates.
//   Explanation for Other Options:                 <- one heading, then the three wrong ones
//   B: <text>                                      <- "B:" with a COLON is an EXPLANATION
//   C: …  D: …
//
// Notes:
//
//   * "A." means an option and "A:" means that option's explanation, in the same document. One
//     character separates them, so both patterns are anchored and punctuation-specific rather
//     than sharing a letter-label pattern, and the reader's mode is checked as well — neither
//     can be read as the other.
//   * the explanation text sits on the line BELOW its label. The label pattern still accepts
//     text after the colon, so a revision that moves it up reads without a change here.
//   * the "(Correct)" label states the key a SECOND time, independently of the "Correct Answer"
//     line. The two are checked against each other rather than one being trusted; that is the
//     only independent witness this source offers.
//   * the key line opens with a tick glyph, so the match is on the label and not the glyph.
//   * a scenario is its own paragraph, giving a two-line prompt. Both lines are kept in source
//     order — the split is the author's. The builder drops only the leading "Scenario:" label,
//     without which the importer reads the line as an answer option.
//   * "Graded Quiz", "Course Name:" and "Volume:" are running header paragraphs and ignored.
//
// Content passes through with only leading and trailing whitespace removed.
const fs = require('fs');
const path = require('path');
const { lines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'haws-c1';

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n` +
    'Module titles and the reference line come from the outline, scoped to Course 2:\n' +
    `  node src/haws-c1-parse-outline.js > ${outlinePath}`);
  process.exit(1);
}
const { map: VIDEOS, meta: MMETA } = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

// Course 1 ships ONE document covering all three modules, unlike Course 2's one-per-module set.
const DOCDIR = path.join(SP, SLUG, 'docs');
const DOCS = fs.readdirSync(DOCDIR)
  .map(name => path.join(DOCDIR, name, 'word', 'document.xml'))
  .filter(f => fs.existsSync(f));
if (DOCS.length !== 1) throw new Error('expected exactly one quiz document under ' + DOCDIR);
const newQ = () => ({ num: 0, sourceNum: null, prompt: '', _prompt: [], options: [], correct: null,
                      correctExplFor: [], feedback: {}, mapped: '', bloom: '', scope: '',
                      hasScenario: false });
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

  // These sources state no Bloom level; the CSTP ones this parser came from did. Its
  // absence here is a property of the source, not a defect.

  // Module 2's questions are cross-functional by design and cite no single video, so an
  // unmapped question is counted and reported once per module rather than ten times.
  if (!q.mapped) cur.unmapped++;
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

let explFor = null;
for (const line of lines(DOCS[0])) {
  if (!line) continue;
  let m;

  // document banner lines
  if (/^Graded Quiz$/i.test(line)) continue;
  if (/^Course Name\s*:/i.test(line)) continue;
  if (/^Volume\s*:/i.test(line)) continue;

  // "Module 1: Understanding Human and AI Collaboration Fundamentals"
  if ((m = line.match(/^Module\s+(\d+)\s*[:.-]\s*(.+)$/i))) {
    pushQ();
    cur = { num: +m[1], title: clean(m[2]), questions: [], unmapped: 0 };
    modules.push(cur);
    mode = null;
    continue;
  }

  // "Q1. <first prompt line>" - the header carries the opening line of the prompt.
  if ((m = line.match(/^Q(\d+)\.\s*(.+)$/i))) {
    pushQ();
    q = newQ();
    q.sourceNum = +m[1];
    q._prompt.push(m[2]);
    mode = 'head';
    explFor = null;
    continue;
  }
  if (!q) continue;

  if ((m = line.match(/^Mapped to\s*:\s*(M\d+L\d+V\d+)\b/i))) {
    q.mapped = m[1].toUpperCase();
    continue;
  }
  // the key line opens with a tick glyph in this source; match on the label, not the glyph
  if ((m = line.match(/^[^A-Za-z]*Correct Answer\s*:\s*\(?([A-Da-d])\)?\b/i))) {
    q.correct = m[1].toUpperCase();
    mode = null;
    continue;
  }

  // "Explanation for Option B (Correct):" - its text follows on the next line.
  if ((m = line.match(/^Explanation for Option\s+([A-Da-d])\s*\(\s*Correct\s*\)\s*:\s*(.*)$/i))) {
    explFor = m[1].toUpperCase();
    if (!q.correctExplFor.includes(explFor)) q.correctExplFor.push(explFor);
    if (m[2].trim()) q.feedback[explFor] = verbatim(m[2]);
    mode = 'expl';
    continue;
  }
  // "Explanation for Other Options:" - the three wrong options follow as "A: <text>".
  if (/^Explanation for Other Options\s*:\s*$/i.test(line)) {
    mode = 'others';
    explFor = null;
    continue;
  }

  // "A: <text>" is an explanation; "A. <text>" is an option. The separator tells them apart,
  // and the mode is checked too so neither can be read as the other.
  if (mode === 'others' && (m = line.match(/^([A-Da-d])\s*:\s*(.+)$/))) {
    explFor = m[1].toUpperCase();
    if (q.feedback[explFor]) warn.push('M' + cur.num + ' Q' + q.sourceNum
      + ': two explanations for option ' + explFor);
    q.feedback[explFor] = verbatim(m[2]);
    continue;
  }
  if (mode !== 'others' && mode !== 'expl' && (m = line.match(/^([A-Da-d])\.\s*(.+)$/))) {
    q.options.push({ letter: m[1].toUpperCase(), text: verbatim(m[2]) });
    mode = 'opts';
    continue;
  }

  // continuation lines
  if ((mode === 'expl' || mode === 'others') && explFor) {
    q.feedback[explFor] = q.feedback[explFor] ? q.feedback[explFor] + ' ' + verbatim(line) : verbatim(line);
    continue;
  }
  if (mode === 'opts' && q.options.length) {
    q.options[q.options.length - 1].text += ' ' + verbatim(line);
    continue;
  }
  if (mode === 'head') { q._prompt.push(line); continue; }
  warn.push('M' + (cur ? cur.num : '?') + ': unplaced line "' + line.slice(0, 50) + '"');
}
pushQ();

if (process.argv.includes('--report')) {
  modules.forEach(mo => {
    const lessons = new Set(mo.questions.map(x => (x.mapped.match(/^M\d+(L\d+)/) || [])[1]).filter(Boolean));
    const scen = mo.questions.filter(x => x.hasScenario).length;
    console.log(`Module ${mo.num} — ${mo.title}: ${mo.questions.length} questions, `
      + `${lessons.size} lessons covered, ${scen} scenario-framed`
      + (mo.unmapped ? `, ${mo.unmapped} citing no video` : ''));
  });
  const all = modules.flatMap(mo => mo.questions);
  console.log(`\n${modules.length} modules · ${all.length} questions · `
    + `${all.filter(x => x.mapped).length} mapped · `
    + `${all.reduce((a, x) => a + Object.keys(x.feedback).length, 0)} explanations · `
    + `${all.filter(x => x.hasScenario).length} scenarios`);
  const spread = o => Object.entries(o).sort().map(([k, v]) => `${k}:${v}`).join(' ');
  const byLetter = {};
  for (const x of all) { byLetter[x.correct] = (byLetter[x.correct] || 0) + 1; }
  console.log('answer key spread: ' + spread(byLetter));
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify(modules, null, 2));
}
