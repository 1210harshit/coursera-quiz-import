// Parser for the Full AI Toolkit for Work and Side Income graded quiz (v2).
//
// The fifth table shape here, and closest to paid-social: a "Mapped to:" paragraph above each
// table, feedback rows that carry no letter and belong to the option above them, and every
// explanation opening with a "(Correct)" / "(Incorrect)" marker. The one structural difference
// is where the answer key lives — inside the question cell, as its second paragraph, rather
// than in a paragraph after the table. That makes each table self-contained, so a question
// closes when its table ends and no state is carried across blocks.
//
//   Mapped to: M1L1V12 - ChatGPT Tokens Explained                 <- paragraph, before
//   ┌──────────┬──────────────────────────────────────────────┐
//   │ Q1       │ What was the token limit for ChatGPT 3.5?     │
//   │          │ ✅ Correct Answer: B                          │   <- second paragraph, same cell
//   │ A        │ 2,048 tokens                                 │
//   │ Feedback │ (Incorrect) This number is lower than …      │
//   │ B        │ 4,096 tokens                                 │
//   │ Feedback │ (Correct) The video states that …            │   … C and D likewise
//   └──────────┴──────────────────────────────────────────────┘
//
// Questions are already numbered 1-10 within each module, so nothing is renumbered.
// The "(Correct)" / "(Incorrect)" markers are stripped by the builder; quiz.json keeps the
// source text verbatim. See stripMarker in ai-toolkit-v2-build.js and its verifier mirror.
//
// Text fidelity: option, explanation and prompt text is passed through with only leading and
// trailing whitespace removed. Runs of spaces inside a line are the author's and survive.
const fs = require('fs');
const path = require('path');
const { readBlocks } = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'digital-marketing';
const blocks = readBlocks(path.join(SP, SLUG, 'quiz', 'word', 'document.xml'));

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n` +
    'The reference line and the mapping cross-check both come from the outline:\n' +
    `  node src/ai-toolkit-v2-parse-outline.js > ${outlinePath}`);
  process.exit(1);
}
const { map: VIDEOS } = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

// For metadata, where collapsing is harmless.
const clean = s => String(s).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
// For content. Trims the ends, which the verifier requires, and converts a non-breaking space
// so one cannot reach an import line. Everything else survives exactly as written.
const verbatim = s => String(s).replace(/ /g, ' ').replace(/^\s+|\s+$/g, '');
const norm = s => clean(s)
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/\s*&\s*/g, ' and ')
  .replace(/[.,:;]+$/, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

const ROW_LABEL = /^(Q\s*\d+|Feedback|[A-D])\s*[.:]?\s*$/i;
const modules = [];
const warn = [];

let cur = null;
let pendingMap = null;   // {code, title} from the last "Mapped to:" line

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    if (!t) continue;
    let m;
    if ((m = t.match(/^Module\s+(\d+)\s*[:—–-]\s*(.+)$/i))) {
      cur = { num: +m[1], title: clean(m[2]), questions: [] };
      modules.push(cur);
      pendingMap = null;
      continue;
    }
    if ((m = t.match(/^Mapped to\s*:\s*(M\d+L\d+V\d+)\s*(?:[—–-]\s*(.*))?$/i))) {
      pendingMap = { code: m[1].toUpperCase(), title: clean(m[2] || '') };
      continue;
    }
    continue;
  }

  // ---- a question table ----
  const rows = b.rows.filter(r => r.length >= 2 && ROW_LABEL.test(clean(r[0])));
  if (rows.length < 3) continue;
  if (!cur) { warn.push('question table before any module heading — skipped'); continue; }

  const q = { num: 0, sourceNum: null, prompt: '', options: [], correct: null,
              feedback: {}, mapped: '', mappedTitle: '' };
  let lastLetter = null;

  for (const cells of rows) {
    const label = clean(cells[0]).replace(/[.:]\s*$/, '').toUpperCase();
    const paras = (cells[1] || '').split('\n').map(verbatim).filter(Boolean);
    let m;
    if ((m = label.match(/^Q\s*(\d+)$/))) {
      q.sourceNum = +m[1];
      // The cell holds the prompt and then the answer key. Any paragraph that is not the key
      // is prompt, so a future revision adding a second prompt paragraph keeps its own line.
      const promptParas = [];
      for (const p of paras) {
        const km = p.match(/^\s*(?:✅\s*)?Correct Answer\s*:\s*\(?([A-D])\)?\b/i);
        if (km) {
          if (q.correct) warn.push(`M${cur.num} Q${q.sourceNum}: two answer-key paragraphs`);
          q.correct = km[1].toUpperCase();
        } else promptParas.push(p);
      }
      q.prompt = promptParas.length === 1 ? promptParas[0] : promptParas;
    } else if (/^[A-D]$/.test(label)) {
      q.options.push({ letter: label, text: paras.join(' ') });
      lastLetter = label;
    } else if (label === 'FEEDBACK') {
      if (!lastLetter) { warn.push(`M${cur.num} Q${q.sourceNum}: a Feedback row precedes its option`); continue; }
      if (q.feedback[lastLetter]) warn.push(`M${cur.num} Q${q.sourceNum}: two Feedback rows for option ${lastLetter}`);
      q.feedback[lastLetter] = paras.join(' ');
    }
  }

  if (pendingMap) { q.mapped = pendingMap.code; q.mappedTitle = pendingMap.title; }
  pendingMap = null;

  q.num = cur.questions.length + 1;
  const where = `M${cur.num} Q${q.num}`;

  const promptLines = Array.isArray(q.prompt) ? q.prompt : [q.prompt];
  if (!promptLines.filter(Boolean).length) warn.push(`${where}: no prompt`);
  if (q.sourceNum === null) warn.push(`${where}: table has no "Q<n>" label`);
  else if (q.sourceNum !== q.num) warn.push(`${where}: table is labelled Q${q.sourceNum} but sits at position ${q.num}`);
  if (q.options.length !== 4) warn.push(`${where}: ${q.options.length} options`);
  if (!q.correct) warn.push(`${where}: no answer key in the question cell`);
  else if (!q.options.some(o => o.letter === q.correct)) {
    warn.push(`${where}: key is ${q.correct} but there is no option ${q.correct}`);
  }

  const missing = q.options.map(o => o.letter).filter(L => !q.feedback[L]);
  if (missing.length) warn.push(`${where}: no feedback for ${missing.join(', ')}`);

  // The marker inside each explanation states the key a second time. A disagreement means one
  // of the two was edited alone.
  const marked = Object.entries(q.feedback)
    .filter(([, fb]) => /^\(Correct\)/i.test(fb)).map(([L]) => L);
  if (marked.length !== 1) {
    warn.push(`${where}: ${marked.length} options carry a "(Correct)" marker (${marked.join(', ') || 'none'})`);
  } else if (q.correct && marked[0] !== q.correct) {
    warn.push(`${where}: answer key says ${q.correct} but the "(Correct)" marker is on ${marked[0]}`);
  }
  for (const [L, fb] of Object.entries(q.feedback)) {
    if (!/^\((Correct|Incorrect)\)/i.test(fb)) {
      warn.push(`${where}: feedback ${L} does not open with a (Correct)/(Incorrect) marker: "${fb.slice(0, 40)}"`);
    }
  }

  if (!q.mapped) warn.push(`${where}: no "Mapped to" line above the question`);
  else {
    if (!VIDEOS[q.mapped]) warn.push(`${where}: mapped to ${q.mapped}, which the outline has no video for`);
    else if (q.mappedTitle && norm(q.mappedTitle) !== norm(VIDEOS[q.mapped].video)) {
      warn.push(`${where}: quiz writes ${q.mapped} as "${q.mappedTitle}" but the outline calls it `
        + `"${VIDEOS[q.mapped].video}" — the reference line will use the outline's wording`);
    }
    if (!q.mapped.startsWith(`M${cur.num}L`)) {
      warn.push(`${where}: mapped to ${q.mapped}, which is outside module ${cur.num}`);
    }
  }

  // A prompt line beginning "Word:" is read by the importer as an answer option.
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
