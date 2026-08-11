// Parser for the Complete Shopify Dropshipping graded quiz.
//
// Table-based, in the family of ai-toolkit-v2 and paid-social — a mapping paragraph above each
// table, Feedback rows carrying no letter and belonging to the option above them, and every
// explanation opening with a "(Correct)" / "(Incorrect)" marker. Two things are its own:
//
//   * there is NO answer-key line anywhere. Not after the table as in paid-social, not inside
//     the question cell as in ai-toolkit-v2, not at all. The key exists only as the "(Correct)"
//     marker on one of the four explanations, so that marker IS the answer key here rather
//     than a second opinion about it. genai-appdev is the only other source that does this.
//     Because the marker is load-bearing, a question with none or with more than one is a hard
//     warning rather than a cross-check failure.
//   * the mapping is the dotted number the outline uses for its videos, in a "Source video"
//     line: "1.1.2 - Essential #1 - How you will make money!" is M1L1V2. Note the title itself
//     contains a hyphen, so only the FIRST separator after the number is the delimiter.
//
//   Source video: 1.1.2 - Essential #1 - How you will make money!
//   ┌──────────┬──────────────────────────────────────────────┐
//   │ Q1       │ <prompt>                                     │
//   │ A        │ <option text>                                │
//   │ Feedback │ (Incorrect) …                                │
//   │ B        │ <option text>                                │
//   │ Feedback │ (Correct) …                                  │   … C and D likewise
//   └──────────┴──────────────────────────────────────────────┘
//
// Questions are numbered 1-40 straight through and are renumbered 1-10 per module, since
// Coursera imports one document per module. `sourceNum` keeps the original.
//
// The markers are stripped by the builder; quiz.json keeps the source text verbatim. Content
// passes through with only leading and trailing whitespace removed.
const fs = require('fs');
const path = require('path');
const { readBlocks } = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'shopify';
const blocks = readBlocks(path.join(SP, SLUG, 'quiz', 'word', 'document.xml'));

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n` +
    'The reference line and the mapping cross-check both come from the outline:\n' +
    `  node src/shopify-parse-outline.js > ${outlinePath}`);
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

const ROW_LABEL = /^(Q\s*\d+|Feedback|[A-D])\s*[.:]?\s*$/i;
const modules = [];
const warn = [];

let cur = null;
let pendingSource = null;   // {code:"1.1.2", key:"M1L1V2", title}

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    if (!t) continue;
    let m;
    if ((m = t.match(/^Module\s+(\d+)\s*[:—–-]\s*(.+)$/i))) {
      cur = { num: +m[1], title: clean(m[2]), questions: [] };
      modules.push(cur);
      pendingSource = null;
      continue;
    }
    // Only the first separator after the dotted number delimits the title; the titles
    // themselves contain hyphens ("Essential #1 - How you will make money!").
    if ((m = t.match(/^Source video\s*:\s*(\d+)\.(\d+)\.(\d+)\s*[—–-]\s*([\s\S]*)$/i))) {
      pendingSource = { code: `${m[1]}.${m[2]}.${m[3]}`, key: `M${m[1]}L${m[2]}V${m[3]}`,
                        title: clean(m[4] || '') };
      continue;
    }
    if (/^Source video\s*:/i.test(t)) {
      warn.push(`unreadable "Source video" line: "${clean(t)}"`);
      pendingSource = null;
    }
    continue;
  }

  // ---- a question table ----
  const rows = b.rows.filter(r => r.length >= 2 && ROW_LABEL.test(clean(r[0])));
  if (rows.length < 3) continue;
  if (!cur) { warn.push('question table before any module heading — skipped'); continue; }

  const q = { num: 0, sourceNum: null, prompt: '', options: [], correct: null,
              feedback: {}, mapped: '', sourceCode: '', sourceTitle: '' };
  let lastLetter = null;

  for (const cells of rows) {
    const label = clean(cells[0]).replace(/[.:]\s*$/, '').toUpperCase();
    const paras = (cells[1] || '').split('\n').map(verbatim).filter(Boolean);
    let m;
    if ((m = label.match(/^Q\s*(\d+)$/))) {
      q.sourceNum = +m[1];
      q.prompt = paras.length === 1 ? paras[0] : paras;
    } else if (/^[A-D]$/.test(label)) {
      q.options.push({ letter: label, text: paras.join(' ') });
      lastLetter = label;
    } else if (label === 'FEEDBACK') {
      if (!lastLetter) { warn.push(`M${cur.num} src-Q${q.sourceNum}: a Feedback row precedes its option`); continue; }
      if (q.feedback[lastLetter]) warn.push(`M${cur.num} src-Q${q.sourceNum}: two Feedback rows for option ${lastLetter}`);
      q.feedback[lastLetter] = paras.join(' ');
    }
  }

  if (pendingSource) {
    q.mapped = pendingSource.key;
    q.sourceCode = pendingSource.code;
    q.sourceTitle = pendingSource.title;
  }
  pendingSource = null;

  q.num = cur.questions.length + 1;
  const where = `M${cur.num} Q${q.num} (source Q${q.sourceNum})`;

  // The "(Correct)" marker IS the answer key in this source — nothing else states it.
  const marked = Object.entries(q.feedback)
    .filter(([, fb]) => /^\(Correct\)/i.test(fb)).map(([L]) => L);
  if (marked.length === 1) q.correct = marked[0];
  else {
    warn.push(`${where}: the answer key is the "(Correct)" marker and ${marked.length} options `
      + `carry one (${marked.join(', ') || 'none'}) — the question has no usable key`);
  }

  const promptLines = Array.isArray(q.prompt) ? q.prompt : [q.prompt];
  if (!promptLines.filter(Boolean).length) warn.push(`${where}: no prompt`);
  if (q.sourceNum === null) warn.push(`${where}: table has no "Q<n>" label`);
  if (q.options.length !== 4) warn.push(`${where}: ${q.options.length} options`);
  if (q.correct && !q.options.some(o => o.letter === q.correct)) {
    warn.push(`${where}: key is ${q.correct} but there is no option ${q.correct}`);
  }

  const missing = q.options.map(o => o.letter).filter(L => !q.feedback[L]);
  if (missing.length) warn.push(`${where}: no feedback for ${missing.join(', ')}`);
  for (const [L, fb] of Object.entries(q.feedback)) {
    if (!/^\((Correct|Incorrect)\)/i.test(fb)) {
      warn.push(`${where}: feedback ${L} does not open with a (Correct)/(Incorrect) marker: "${fb.slice(0, 40)}"`);
    }
  }

  if (!q.mapped) warn.push(`${where}: no "Source video" line above the question`);
  else {
    if (!VIDEOS[q.mapped]) warn.push(`${where}: mapped to ${q.mapped} ("${q.sourceCode}"), which the outline has no video for`);
    else if (q.sourceTitle && norm(q.sourceTitle) !== norm(VIDEOS[q.mapped].video)) {
      warn.push(`${where}: quiz writes ${q.mapped} as "${q.sourceTitle}" but the outline calls it `
        + `"${VIDEOS[q.mapped].video}" — the reference line will use the outline's wording`);
    }
    if (!q.mapped.startsWith(`M${cur.num}L`)) {
      warn.push(`${where}: mapped to ${q.mapped}, which is outside module ${cur.num}`);
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
