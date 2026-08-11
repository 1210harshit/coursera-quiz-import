// Parser for the FINAL Google Ads for Performance Marketers graded assessment.
//
// Same course and the same outline as `google-ads`, but a rewritten assessment document with a
// different shape, so it gets its own slug — as `genai-marketing-explanations` does beside
// `genai-marketing`. This one supersedes the draft: it carries a real explanation per option
// rather than one shared across four, a spread answer key rather than B on 78 of 80, a Bloom's
// level per question, and no duplicated question.
//
// Paragraph-based, not table-based:
//
//   Module 1                                                    <- Heading1, no title
//   Question 1                                                  <- Heading2, numbered 1-10 per module
//   Mapped to: M1L1V1 | Bloom's Level: Remember
//   Source learning item: Google Ads Overview, …
//   Scenario: A new advertiser is deciding …⏎What distinguishes …   <- ONE paragraph, <w:br/> inside
//   A. <option text>
//   ✅ Correct Answer: A                                         <- only under the keyed option
//   Correct Explanation: <text>
//   B. <option text>
//   Incorrect Explanation: <text>                                <- … C and D likewise
//
// Two importer rules decide how the prompt is handled, both learned from real rejections and
// recorded in README:
//
//   * a prompt line beginning "Word:" is read as an ANSWER OPTION, which is what made every
//     scenario question fail on the osha course. The label is dropped by the builder, which
//     already does this for every course; quiz.json keeps the source wording. This is the ONE
//     place the built document departs from the source text, and it is not optional.
//   * the scenario and the question sit in one paragraph separated by <w:br/>. lib-lines.js
//     splits on the break and both halves are KEPT AS SEPARATE LINES, each becoming its own
//     paragraph in the built document — the source's line structure is the author's, not
//     noise to flatten. The builder separates them with paragraph spacing rather than an empty
//     paragraph, because a blank line inside a prompt can terminate it for the importer.
//
// Text is otherwise passed through verbatim. Only leading and trailing whitespace is removed,
// which the verifier requires; runs of spaces inside a line are the author's and survive.
const fs = require('fs');
const path = require('path');
const { lines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'google-ads-final';

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n` +
    'Module titles and the source-item cross-check both come from the outline:\n' +
    `  node src/google-ads-final-parse-outline.js > ${outlinePath}`);
  process.exit(1);
}
const { map: VIDEOS, meta: MMETA } = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

const raw = lines(path.join(SP, SLUG, 'quiz', 'word', 'document.xml'));

// For metadata — mapping codes, titles, Bloom's levels — where collapsing is harmless.
const clean = s => String(s).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();

// For content — prompts, options, explanations. Trims the ends, which the verifier requires,
// and converts a non-breaking space to an ordinary one so it cannot survive into an import
// line. Everything else, including runs of spaces inside the text, is left exactly as written.
const verbatim = s => String(s).replace(/ /g, ' ').replace(/^\s+|\s+$/g, '');
const norm = s => clean(s)
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/\s*&\s*/g, ' and ')
  .replace(/[.,:;]+$/, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

const modules = [];
const warn = [];
let cur = null, q = null, mode = null, lastLetter = null;

function pushQ() {
  if (!q) return;
  if (!cur) { warn.push(`question ${q.sourceNum} before any module heading — dropped`); q = null; return; }

  // The scenario and the question arrive as separate lines because <w:br/> separates them
  // inside one paragraph. That split is the author's, so it is kept: each line becomes its own
  // paragraph in the built document, in source order. A single-line prompt stays a plain
  // string so the JSON reads the way every other course's does.
  const parts = q._prompt.map(verbatim).filter(Boolean);
  q.prompt = parts.length === 1 ? parts[0] : parts;
  q.hasScenario = /^\s*Scenario\s*:/i.test(parts[0] || '');
  delete q._prompt;

  q.num = cur.questions.length + 1;
  const where = `M${cur.num} Q${q.num}`;

  const promptLines = Array.isArray(q.prompt) ? q.prompt : [q.prompt];
  if (!promptLines.filter(Boolean).length) warn.push(`${where}: no prompt`);
  if (q.sourceNum !== null && q.sourceNum !== q.num) {
    warn.push(`${where}: document numbers it Question ${q.sourceNum} but it sits at position ${q.num}`);
  }
  if (q.options.length !== 4) warn.push(`${where}: ${q.options.length} options`);
  if (!q.correct) warn.push(`${where}: no "Correct Answer" line`);
  else if (!q.options.some(o => o.letter === q.correct)) {
    warn.push(`${where}: key is ${q.correct} but there is no option ${q.correct}`);
  }

  const missing = q.options.map(o => o.letter).filter(L => !q.feedback[L]);
  if (missing.length) warn.push(`${where}: no explanation for ${missing.join(', ')}`);

  // "Correct Explanation:" appears under the keyed option and nowhere else. It states the key
  // a second time, so a disagreement means one side was edited alone.
  if (q.correctExplFor && q.correct && q.correctExplFor !== q.correct) {
    warn.push(`${where}: answer key says ${q.correct} but the "Correct Explanation" sits under ${q.correctExplFor}`);
  }
  if (!q.correctExplFor) warn.push(`${where}: no "Correct Explanation" paragraph`);

  if (!q.bloom) warn.push(`${where}: no Bloom's level`);

  if (!q.mapped) warn.push(`${where}: no "Mapped to" line`);
  else {
    if (!VIDEOS[q.mapped]) warn.push(`${where}: mapped to ${q.mapped}, which the outline has no video for`);
    else if (q.sourceItem && norm(q.sourceItem) !== norm(VIDEOS[q.mapped].video)) {
      warn.push(`${where}: quiz writes ${q.mapped} as "${q.sourceItem}" but the outline calls it `
        + `"${VIDEOS[q.mapped].video}" — the reference line will use the outline's wording`);
    }
    if (!q.mapped.startsWith(`M${cur.num}L`)) {
      warn.push(`${where}: mapped to ${q.mapped}, which is outside module ${cur.num}`);
    }
  }

  // The builder drops a leading "Scenario:" label from the FIRST line only; a label-like token
  // anywhere else, or on a later line, would still be read by the importer as an answer option.
  promptLines.forEach((line, i) => {
    const text = i === 0 ? line.replace(/^\s*Scenario\s*:\s*/i, '') : line;
    if (/^[A-Za-z][A-Za-z ]{0,24}:\s/.test(text)) {
      warn.push(`${where}: prompt line ${i + 1} starts with a label-like token, which the importer `
        + `reads as an answer option: "${text.slice(0, 40)}"`);
    }
  });

  cur.questions.push(q);
  q = null;
}

for (const line of raw) {
  if (!line) continue;
  let m;

  if ((m = line.match(/^Module\s+(\d+)$/i))) {
    pushQ();
    const num = +m[1];
    cur = { num, title: (MMETA['M' + num] || {}).title || '', questions: [] };
    if (!cur.title) warn.push(`Module ${num}: the outline has no title for it`);
    modules.push(cur);
    mode = null;
    continue;
  }

  if ((m = line.match(/^Question\s+(\d+)$/i))) {
    pushQ();
    q = { num: 0, sourceNum: +m[1], prompt: '', _prompt: [], options: [], correct: null,
          correctExplFor: null, feedback: {}, mapped: '', sourceItem: '', bloom: '',
          hasScenario: false };
    mode = 'head'; lastLetter = null;
    continue;
  }
  if (!q) continue;

  if ((m = line.match(/^Mapped to\s*:\s*(M\d+L\d+V\d+)\s*(?:\|\s*Bloom'?s Level\s*:\s*(.+))?$/i))) {
    q.mapped = m[1].toUpperCase();
    if (m[2]) q.bloom = clean(m[2]);
    continue;
  }
  if ((m = line.match(/^Source learning item\s*:\s*(.+)$/i))) { q.sourceItem = clean(m[1]); continue; }

  if ((m = line.match(/^\s*(?:✅\s*)?Correct Answer\s*:\s*\(?([A-D])\)?\b/i))) {
    q.correct = m[1].toUpperCase();
    continue;
  }
  if ((m = line.match(/^(Correct|Incorrect) Explanation\s*:\s*([\s\S]*)$/i))) {
    if (!lastLetter) { warn.push(`M${cur ? cur.num : '?'} Q${q.sourceNum}: an explanation precedes its option`); continue; }
    if (q.feedback[lastLetter]) warn.push(`M${cur ? cur.num : '?'} Q${q.sourceNum}: two explanations for option ${lastLetter}`);
    q.feedback[lastLetter] = verbatim(m[2]);
    if (/^correct$/i.test(m[1])) q.correctExplFor = lastLetter;
    mode = 'fb';
    continue;
  }

  if ((m = line.match(/^([A-D])\.\s+([\s\S]*)$/))) {
    q.options.push({ letter: m[1], text: verbatim(m[2]) });
    lastLetter = m[1];
    mode = 'opts';
    continue;
  }

  // Continuations. Before the first option every unmatched line is prompt; after it, a line
  // belongs to whichever option or explanation opened last.
  if (mode === 'head') { q._prompt.push(line); continue; }
  if (mode === 'opts' && lastLetter) {
    const o = q.options.find(x => x.letter === lastLetter);
    if (o) { o.text += ' ' + verbatim(line); continue; }
  }
  if (mode === 'fb' && lastLetter && q.feedback[lastLetter]) {
    q.feedback[lastLetter] += ' ' + verbatim(line);
    continue;
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
  const promptOf = x => (Array.isArray(x.prompt) ? x.prompt : [x.prompt]);
  console.log('prompt lines:      ' + all.filter(x => promptOf(x).length > 1).length
    + ' questions keep the source\'s two-line split, ' + all.filter(x => promptOf(x).length === 1).length + ' are one line');
  console.log('longest line:      ' + Math.max(...all.flatMap(x => promptOf(x).map(l => l.length))) + ' characters');
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify(modules, null, 2));
}
