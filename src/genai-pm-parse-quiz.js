// Parser for the GenAI for Project Managers graded quiz.
//
// Table-based, in the family of ai-toolkit-v2 and shopify, with three things of its own:
//
//   * the mapping is stated in the QUESTION LABEL — "Q1-M1L1V1" — and again in a "Mapped
//     Video:" row that repeats the code with the video's title. Two statements of the same
//     thing, so they are checked against each other and against the outline.
//   * there is no answer-key line. As in shopify, the verdict word on one explanation is the
//     key — but written bare, "Correct." / "Incorrect.", rather than bracketed. That is the
//     osha form, so the builder strips it with the bare-word regex.
//   * questions run 1-20 across the document and are renumbered 1-10 per module.
//
//   ┌────────────────┬────────────────────────────────────────────┐
//   │ Q1-M1L1V1      │ <prompt>                                   │
//   │ Mapped Video:  │ M1L1V1 - What is Generative AI and How It … │
//   │ A              │ <option text>                              │
//   │ Feedback       │ Incorrect. …                               │
//   │ B              │ <option text>                              │
//   │ Feedback       │ Correct. …                                 │   … C and D likewise
//   └────────────────┴────────────────────────────────────────────┘
//
// Two labels are written irregularly and are read anyway: one question's label is not bold
// where every other is (which changes nothing textually), and Q18's is split across runs as
// "Q18- M2L3V1", with the space after the hyphen. The label pattern tolerates whitespace
// around the separator for that reason.
//
// Content passes through with only leading and trailing whitespace removed.
const fs = require('fs');
const path = require('path');
const { readBlocks } = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'genai-pm';
const blocks = readBlocks(path.join(SP, SLUG, 'quiz', 'word', 'document.xml'));

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n` +
    'The reference line and the mapping cross-check both come from the outline:\n' +
    `  node src/genai-pm-parse-outline.js > ${outlinePath}`);
  process.exit(1);
}
const { map: VIDEOS } = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

const clean = s => String(s).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
const verbatim = s => String(s).replace(/ /g, ' ').replace(/^\s+|\s+$/g, '');
const norm = s => clean(s)
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/\s*&\s*/g, ' and ')
  .replace(/[.,:;]+$/, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

// Force a mapping, keyed "M<module> Q<number-in-module>". Empty by design.
//
// The one candidate is M1 Q5. Its prompt is about generating meeting summaries, tracking
// issues and producing weekly reports — which is M1L2V2, "AI for Execution and Monitoring
// Activities". The source says M2L2V2, "Evaluating Scope Changes Using AI Analysis", in both
// the question label and the Mapped Video row, and copies that video's title too, so the
// error is stated consistently rather than being a transcription slip this parser can undo.
// Re-pointing it is an editorial decision about which the author is right about; the mapping
// is left as written and reported. To take the decision, uncomment:
//   'M1 Q5': 'M1L2V2',
const MAPPING_OVERRIDE = {};

const Q_LABEL = /^Q\s*(\d+)\s*[-–—]\s*(M\d+L\d+V\d+)$/i;
const ROW_LABEL = /^(Q\s*\d+\s*[-–—]\s*M\d+L\d+V\d+|Mapped Video|Feedback|[A-D])\s*[.:]?\s*$/i;
const modules = [];
const warn = [];

let cur = null;

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    if (!t) continue;
    let m;
    // "Module Name and Number: Module 1 – Foundations and High-Value GenAI Use Cases"
    if ((m = t.match(/^Module Name and Number\s*:\s*Module\s+(\d+)\s*[-–—:]\s*(.+)$/i))) {
      cur = { num: +m[1], title: clean(m[2]), questions: [] };
      modules.push(cur);
      continue;
    }
    continue;
  }

  // ---- a question table ----
  const rows = b.rows.filter(r => r.length >= 2 && ROW_LABEL.test(clean(r[0])));
  if (rows.length < 3) continue;
  if (!cur) { warn.push('question table before any module heading — skipped'); continue; }

  const q = { num: 0, sourceNum: null, prompt: '', options: [], correct: null, feedback: {},
              mapped: '', labelCode: '', mappedTitle: '' };
  let lastLetter = null;

  for (const cells of rows) {
    const label = clean(cells[0]).replace(/[.:]\s*$/, '');
    const paras = (cells[1] || '').split('\n').map(verbatim).filter(Boolean);
    let m;
    if ((m = label.match(Q_LABEL))) {
      q.sourceNum = +m[1];
      q.labelCode = m[2].toUpperCase();
      q.prompt = paras.length === 1 ? paras[0] : paras;
    } else if (/^Mapped Video$/i.test(label)) {
      const value = paras.join(' ');
      const vm = value.match(/^(M\d+L\d+V\d+)\s*(?:[-–—]\s*(.*))?$/i);
      if (vm) { q.mapped = vm[1].toUpperCase(); q.mappedTitle = clean(vm[2] || ''); }
      else warn.push(`M${cur.num} src-Q${q.sourceNum}: unreadable "Mapped Video" value "${value.slice(0, 50)}"`);
    } else if (/^[A-D]$/i.test(label)) {
      q.options.push({ letter: label.toUpperCase(), text: paras.join(' ') });
      lastLetter = label.toUpperCase();
    } else if (/^Feedback$/i.test(label)) {
      if (!lastLetter) { warn.push(`M${cur.num} src-Q${q.sourceNum}: a Feedback row precedes its option`); continue; }
      if (q.feedback[lastLetter]) warn.push(`M${cur.num} src-Q${q.sourceNum}: two Feedback rows for option ${lastLetter}`);
      q.feedback[lastLetter] = paras.join(' ');
    }
  }

  q.num = cur.questions.length + 1;
  const where = `M${cur.num} Q${q.num} (source Q${q.sourceNum})`;

  // The verdict word on one explanation is the answer key; nothing else states it.
  const marked = Object.entries(q.feedback)
    .filter(([, fb]) => /^Correct[.:,!]/i.test(fb)).map(([L]) => L);
  if (marked.length === 1) q.correct = marked[0];
  else {
    warn.push(`${where}: the answer key is the "Correct." verdict and ${marked.length} options `
      + `carry one (${marked.join(', ') || 'none'}) — the question has no usable key`);
  }

  // The label states the mapping and so does the "Mapped Video" row.
  if (!q.mapped && q.labelCode) {
    warn.push(`${where}: no "Mapped Video" row; took ${q.labelCode} from the question label`);
    q.mapped = q.labelCode;
  }
  if (q.mapped && q.labelCode && q.mapped !== q.labelCode) {
    warn.push(`${where}: the label says ${q.labelCode} but the "Mapped Video" row says ${q.mapped} `
      + '— used the Mapped Video row, which also names the video');
  }

  const promptLines = Array.isArray(q.prompt) ? q.prompt : [q.prompt];
  if (!promptLines.filter(Boolean).length) warn.push(`${where}: no prompt`);
  if (q.sourceNum === null) warn.push(`${where}: table has no "Q<n>-M<x>L<y>V<z>" label`);
  if (q.options.length !== 4) warn.push(`${where}: ${q.options.length} options`);
  if (q.correct && !q.options.some(o => o.letter === q.correct)) {
    warn.push(`${where}: key is ${q.correct} but there is no option ${q.correct}`);
  }
  const missing = q.options.map(o => o.letter).filter(L => !q.feedback[L]);
  if (missing.length) warn.push(`${where}: no feedback for ${missing.join(', ')}`);
  for (const [L, fb] of Object.entries(q.feedback)) {
    if (!/^(Correct|Incorrect)[.:,!]/i.test(fb)) {
      warn.push(`${where}: feedback ${L} does not open with a Correct./Incorrect. verdict: "${fb.slice(0, 40)}"`);
    }
  }

  const tag = `M${cur.num} Q${q.num}`;
  if (MAPPING_OVERRIDE[tag]) {
    warn.push(`${tag}: mapping overridden ${q.mapped || '(none)'} -> ${MAPPING_OVERRIDE[tag]} by MAPPING_OVERRIDE`);
    q.mapped = MAPPING_OVERRIDE[tag];
    q.mappedTitle = '';
  }

  if (!q.mapped) warn.push(`${where}: no mapping at all`);
  else {
    if (!VIDEOS[q.mapped]) warn.push(`${where}: mapped to ${q.mapped}, which the outline has no video for`);
    else if (q.mappedTitle && norm(q.mappedTitle) !== norm(VIDEOS[q.mapped].video)) {
      warn.push(`${where}: quiz writes ${q.mapped} as "${q.mappedTitle}" but the outline calls it `
        + `"${VIDEOS[q.mapped].video}" — the reference line will use the outline's wording`);
    }
    if (!q.mapped.startsWith(`M${cur.num}L`)) {
      warn.push(`${where}: mapped to ${q.mapped}, which is outside module ${cur.num} — the feedback `
        + 'will point the learner at another module. Move the question, or re-map it.');
    }
  }

  promptLines.forEach((line, i) => {
    const text = i === 0 ? String(line).replace(/^\s*Scenario\s*:\s*/i, '') : line;
    if (/^[A-Za-z][A-Za-z ]{0,24}:\s/.test(text)) {
      warn.push(`${where}: prompt line ${i + 1} starts with a label-like token: "${text.slice(0, 40)}"`);
    }
  });

  cur.questions.push(q);
}

if (process.argv.includes('--report')) {
  modules.forEach(mo => {
    const lessons = new Set(mo.questions.map(x => (x.mapped.match(/^M\d+(L\d+)/) || [])[1]).filter(Boolean));
    console.log(`Module ${mo.num} — ${mo.title}: ${mo.questions.length} questions, ${lessons.size} lessons covered`);
  });
  const all = modules.flatMap(mo => mo.questions);
  console.log(`\n${modules.length} modules · ${all.length} questions · `
    + `${all.filter(x => x.mapped).length} mapped · `
    + `${all.reduce((a, x) => a + Object.keys(x.feedback).length, 0)} feedback blocks`);
  const byLetter = {};
  for (const x of all) byLetter[x.correct] = (byLetter[x.correct] || 0) + 1;
  console.log('answer key spread: ' + Object.entries(byLetter).sort().map(([k, v]) => `${k}:${v}`).join(' '));
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify(modules, null, 2));
}
