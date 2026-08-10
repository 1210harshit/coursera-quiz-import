// Parser for the Paid Advertising Across 9 Social Media Platforms graded quiz.
//
// Table-based like google-ads, but a different table and a different surrounding grammar.
// Per question: a "Mapped to:" paragraph, then the table, then the answer key.
//
//   Mapped to: M1L1V8 - How to Promote Your Page And Get Likes      <- paragraph, before
//   ┌──────────┬──────────────────────────────────────────────┐
//   │ Q1       │ <prompt>                                     │
//   │ A        │ <option text>                                │
//   │ Feedback │ (Incorrect) <explanation>                    │
//   │ B        │ <option text>                                │
//   │ Feedback │ (Correct) <explanation>                      │     … C and D likewise
//   └──────────┴──────────────────────────────────────────────┘
//   ✅ Correct Answer: B                                            <- paragraph, after
//
// Consequences:
//
//   * The answer key arrives AFTER its table, so a question is only complete once the key
//     line is read. Anything still open at the next "Mapped to:", the next module heading or
//     end of document is reported rather than silently kept.
//   * Feedback IS per option here — four distinct explanations — unlike google-ads.
//   * Every explanation opens with a literal "(Correct)" or "(Incorrect)" marker. Coursera
//     already shows correct/incorrect status, so the marker is redundant in the import and is
//     stripped by the builder. quiz.json keeps the source text verbatim; see stripMarker in
//     paid-social-build.js and its mirror in paid-social-verify.js.
//   * Questions are numbered 1-90 straight through. They are renumbered 1-10 per module
//     because Coursera imports one document per module; `sourceNum` keeps the original.
//   * The mapping is a code, so no title lookup is needed. The title written beside the code
//     is still checked against the outline's own title for that video — nine platform modules
//     built to one template repeat titles heavily, so a copy-paste slip is easy to make.
const fs = require('fs');
const path = require('path');
const { readBlocks, clean } = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'paid-social';
const blocks = readBlocks(path.join(SP, SLUG, 'quiz', 'word', 'document.xml'));

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n` +
    'The reference line and the mapping cross-check both come from the outline:\n' +
    `  node src/paid-social-parse-outline.js > ${outlinePath}`);
  process.exit(1);
}
const { map: VIDEOS } = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

// Matching only — never written back into a document.
const norm = s => clean(String(s))
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/\s*&\s*/g, ' and ')
  .replace(/[.,:;]+$/, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

const ROW_LABEL = /^(Q\s*\d+|Feedback|[A-D])\s*[.:]?\s*$/i;
const modules = [];
const warn = [];

let cur = null;          // current module
let pendingMap = null;   // {code, title} from the last "Mapped to:" line
let openQ = null;        // question built from a table, waiting for its answer key

function abandon(reason) {
  if (!openQ) return;
  warn.push(`M${openQ._mod} src-Q${openQ.sourceNum}: no "Correct Answer" line before ${reason} — dropped`);
  openQ = null;
}

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    if (!t) continue;
    let m;

    if ((m = t.match(/^Module\s+(\d+)\s*[—–-]\s*(.+)$/i))) {
      abandon('the next module heading');
      cur = { num: +m[1], title: clean(m[2]), questions: [] };
      modules.push(cur);
      pendingMap = null;
      continue;
    }

    if ((m = t.match(/^Mapped to\s*:\s*(M\d+L\d+V\d+)\s*(?:[—–-]\s*(.*))?$/i))) {
      abandon('the next "Mapped to" line');
      pendingMap = { code: m[1].toUpperCase(), title: clean(m[2] || '') };
      continue;
    }

    // "✅ Correct Answer: B" — closes the question the preceding table opened.
    if ((m = t.match(/^\s*(?:✅\s*)?Correct Answer\s*:\s*\(?([A-D])\)?\b/i))) {
      if (!openQ) { warn.push(`answer key "${clean(t)}" with no question table before it`); continue; }
      openQ.correct = m[1].toUpperCase();
      finish(openQ);
      openQ = null;
      continue;
    }
    continue;
  }

  // ---- a question table ----
  const rows = b.rows.filter(r => r.length >= 2 && ROW_LABEL.test(clean(r[0])));
  if (rows.length < 3) continue;
  abandon('the next question table');
  if (!cur) { warn.push('question table before any module heading — skipped'); continue; }

  const q = { num: 0, sourceNum: null, prompt: '', options: [], correct: null,
              feedback: {}, mapped: '', mappedTitle: '', _mod: cur.num };
  let lastLetter = null;

  for (const cells of rows) {
    const label = clean(cells[0]).replace(/[.:]\s*$/, '').toUpperCase();
    const value = (cells[1] || '').split('\n').map(clean).filter(Boolean);
    let m;
    if ((m = label.match(/^Q\s*(\d+)$/))) {
      q.sourceNum = +m[1];
      q.prompt = value.length > 1 ? value.slice() : (value[0] || '');
    } else if (/^[A-D]$/.test(label)) {
      q.options.push({ letter: label, text: value.join(' ') });
      lastLetter = label;
    } else if (label === 'FEEDBACK') {
      // Feedback rows carry no letter of their own; each belongs to the option above it.
      if (!lastLetter) { warn.push(`M${cur.num} src-Q${q.sourceNum}: a Feedback row precedes its option`); continue; }
      if (q.feedback[lastLetter]) warn.push(`M${cur.num} src-Q${q.sourceNum}: two Feedback rows for option ${lastLetter}`);
      q.feedback[lastLetter] = value.join(' ');
    }
  }

  if (pendingMap) { q.mapped = pendingMap.code; q.mappedTitle = pendingMap.title; }
  pendingMap = null;
  openQ = q;
}
abandon('the end of the document');

function finish(q) {
  q.num = cur.questions.length + 1;
  const where = `M${cur.num} Q${q.num} (source Q${q.sourceNum})`;

  if (!q.prompt || (Array.isArray(q.prompt) && !q.prompt.length)) warn.push(`${where}: no prompt`);
  if (q.sourceNum === null) warn.push(`${where}: table has no "Q<n>" label`);
  if (q.options.length !== 4) warn.push(`${where}: ${q.options.length} options`);

  const missing = q.options.map(o => o.letter).filter(L => !q.feedback[L]);
  if (missing.length) warn.push(`${where}: no feedback for ${missing.join(', ')}`);

  if (q.correct && !q.options.some(o => o.letter === q.correct)) {
    warn.push(`${where}: key is ${q.correct} but there is no option ${q.correct}`);
  }

  // The marker inside each explanation is a second, independent statement of the key. When it
  // disagrees with the "Correct Answer" line, one of the two has been edited alone.
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
  else if (!VIDEOS[q.mapped]) warn.push(`${where}: mapped to ${q.mapped}, which the outline has no video for`);
  else if (q.mappedTitle && norm(q.mappedTitle) !== norm(VIDEOS[q.mapped].video)) {
    warn.push(`${where}: quiz writes ${q.mapped} as "${q.mappedTitle}" but the outline calls it `
      + `"${VIDEOS[q.mapped].video}" — the reference line will use the outline's wording`);
  }
  if (q.mapped && !q.mapped.startsWith(`M${cur.num}L`)) {
    warn.push(`${where}: mapped to ${q.mapped}, which is outside module ${cur.num}`);
  }

  // A prompt line beginning "Word: " is read by the importer as an answer option.
  for (const line of (Array.isArray(q.prompt) ? q.prompt : [q.prompt])) {
    if (/^[A-Za-z][A-Za-z ]{0,24}:\s/.test(line)) {
      warn.push(`${where}: prompt starts with a label-like token: "${String(line).slice(0, 40)}"`);
    }
  }

  delete q._mod;
  cur.questions.push(q);
}

if (process.argv.includes('--report')) {
  modules.forEach(mo => {
    const lessons = new Set(mo.questions.map(q => (q.mapped.match(/^M\d+(L\d+)/) || [])[1]).filter(Boolean));
    console.log(`Module ${mo.num} — ${mo.title}: ${mo.questions.length} questions, ${lessons.size} lessons covered`);
  });
  const all = modules.flatMap(m => m.questions);
  console.log(`\n${modules.length} modules · ${all.length} questions · `
    + `${all.filter(q => q.mapped).length} mapped · `
    + `${all.reduce((a, q) => a + Object.keys(q.feedback).length, 0)} feedback blocks`);
  const byLetter = {};
  for (const q of all) byLetter[q.correct] = (byLetter[q.correct] || 0) + 1;
  console.log('answer key spread: ' + Object.entries(byLetter).sort().map(([k, v]) => `${k}:${v}`).join(' '));
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify(modules, null, 2));
}
