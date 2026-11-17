// Parser for the GenAI for Legal Teams graded quizzes — four files, one per module.
//
// In the ai-products family, with the key and the mapping SPLIT by a <w:br/> inside one
// paragraph rather than sharing a line:
//
//   Module 1 – Foundations of Agentic Review and Surgical Redlining
//   Q1. Scenario: A counterparty sends an NDA … What is the strongest first correction?
//   Options:                                        <- a label, sometimes carrying option A
//   A. Instruct the AI to extract the exact clause …
//   B. Ask the AI to rewrite the full NDA …         <- … C and D likewise
//   Correct Answer: A⏎Mapped to: M1L1V1             <- ONE paragraph, split by <w:br/>
//   Explanation for Option A (Correct): This reflects the Rule of Three …
//   Explanation for Option B: Full-document rewriting is too broad …
//
// Four things are its own:
//
//   * THE QUESTION NUMBER AND THE PROMPT SHARE A LINE. ai-products puts "Q1." alone and the
//     scenario below it; here the whole prompt, scenario included, is one paragraph. It stays
//     one paragraph — the source's structure is what reaches the learner (SETUP section 6,
//     convention 3) — so this course needs no --join-prompt.
//   * OPTIONS RUN TOGETHER. Sixteen questions put option A on the "Options:" label line, and
//     three more run two to four options into a single paragraph. splitOptions below only
//     ever breaks on the NEXT letter in sequence, so prose containing "B." cannot split a
//     line that is not waiting for a B; every split is reported.
//   * EXPLANATIONS RUN TOGETHER TOO, twice. That split is on the literal phrase "Explanation
//     for Option <L>", which no explanation's prose contains, so it needs no such guard.
//   * THE CORRECT EXPLANATION COMES FIRST, before A. Order carries no meaning here; every
//     explanation is keyed by its own letter.
//
// Three questions (16, 22, 30) are plain paragraphs where the other 37 are Heading2. Nothing
// here reads paragraph style — questions are found by their "Q<n>." text — so the difference
// does not matter, but it is why a style-driven parser would silently lose three questions.
//
// Numbering runs 1-40 across the four documents and is renumbered 1-10 per module, as
// ai-products does. The source number is kept and checked against the position.
//
// Text is passed through verbatim. Only leading and trailing whitespace is removed, which the
// verifier requires; runs of spaces inside a line are the author's and survive.
const fs = require('fs');
const path = require('path');
const { lines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'genai-legal';
const MODULE_FILES = [1, 2, 3, 4];
const QUESTIONS_PER_MODULE = 10;        // the outline's own Graded Quiz row says 10 per module

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n` +
    'The reference line and the module-title cross-check both come from the outline:\n' +
    `  node src/${SLUG}-parse-outline.js > ${outlinePath}`);
  process.exit(1);
}
const { map: VIDEOS, meta: MMETA } = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

// For metadata — mapping codes, module titles — where collapsing whitespace is harmless.
const clean = s => String(s).replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
// For content — prompts, options, explanations. Trims the ends, which the verifier requires,
// and converts a non-breaking space to an ordinary one so it cannot survive into an import
// line. Everything else, including runs of spaces inside the text, is left as written.
const verbatim = s => String(s).replace(/\u00a0/g, ' ').replace(/^\s+|\s+$/g, '');
const norm = s => clean(s)
  .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
  .replace(/[\u2013\u2014]/g, '-')
  .replace(/\s*&\s*/g, ' and ')
  .replace(/[.,:;]+$/, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

const RE = {
  module:  /^Module\s+(\d+)\s*[:\-\u2013\u2014]\s*(.+)$/i,
  q:       /^Q\s*(\d+)\s*\.\s*(.*)$/i,
  optlbl:  /^Options\s*:\s*(.*)$/i,
  key:     /^Correct Answer\s*:\s*\(?([A-D])\)?\s*(?:Mapped to\s*:\s*(M\d+L\d+V\d+))?\s*$/i,
  mapped:  /^Mapped to\s*:\s*(M\d+L\d+V\d+)\s*$/i,
  // The colon is optional: Q3's explanation for D omits it ("… (Correct) Visible reasoning …").
  expl:    /^Explanation for Option\s+([A-D])\s*(?:\((Correct|Incorrect)\))?\s*(:?)\s*([\s\S]*)$/i,
};

// Several options share one paragraph. Only the NEXT letter in sequence can open a new option,
// so a "B." inside prose can never split a line that is not waiting for a B — and the segment
// after it must start with a capital, an opening quote or a bracket, which every real option
// in this source does. Returns [] when the line does not even begin with `expect`, leaving the
// caller to treat it as something else.
function splitOptions(line, expect) {
  const out = [];
  let rest = String(line);
  let want = expect;
  while (want && want <= 'D') {
    const head = rest.match(new RegExp(`^${want}\\.[ \\t]+`));
    if (!head) break;
    rest = rest.slice(head[0].length);
    const next = String.fromCharCode(want.charCodeAt(0) + 1);
    const at = next > 'D' ? -1
      : rest.search(new RegExp(`\\s${next}\\.[ \\t]+(?=[A-Z\u201c"(])`));
    if (at === -1) { out.push({ letter: want, text: verbatim(rest) }); break; }
    out.push({ letter: want, text: verbatim(rest.slice(0, at)) });
    rest = rest.slice(at + 1);
    want = next;
  }
  return out;
}

// Two explanations share one paragraph in M3 Q23 and Q28. The phrase is literal and appears
// nowhere in the prose, so splitting on it needs no sequence guard.
const splitExplanations = line =>
  String(line).split(/\s+(?=Explanation for Option\s+[A-D]\b)/i).filter(x => x.trim());

const modules = [];
const warn = [];
let cur = null, q = null, mode = null, lastLetter = null;

function pushQ() {
  if (!q) return;
  if (!cur) { warn.push(`question ${q.sourceNum} before any module heading — dropped`); q = null; return; }

  q.prompt = verbatim(q._prompt.join(' '));
  q.hasScenario = /^\s*Scenario\s*:/i.test(q.prompt);
  delete q._prompt;

  q.num = cur.questions.length + 1;
  const where = `M${cur.num} Q${q.num} (source Q${q.sourceNum})`;

  if (!q.prompt) warn.push(`${where}: no prompt`);

  // Numbering runs 1-40 across the four files, so the expected source number is the module's
  // offset plus the position. A mismatch means a question was moved or inserted without
  // renumbering, which is worth naming — the renumbering itself is deliberate.
  const expected = (cur.num - 1) * QUESTIONS_PER_MODULE + q.num;
  if (q.sourceNum === null) warn.push(`${where}: no "Q<n>." label`);
  else if (q.sourceNum !== expected) {
    warn.push(`${where}: numbered Q${q.sourceNum} in the document but sits where Q${expected} `
      + 'should be — a question was moved or inserted without renumbering');
  }

  if (q.options.length !== 4) warn.push(`${where}: ${q.options.length} options`);
  const letters = q.options.map(o => o.letter);
  if (new Set(letters).size !== letters.length) warn.push(`${where}: repeated option letter in ${letters.join('')}`);
  // Coursera refuses a question whose options repeat, with "Duplicate answers are not
  // allowed", and no other check notices. SETUP section 6, convention 4.
  const texts = q.options.map(o => norm(o.text));
  if (new Set(texts).size !== texts.length) warn.push(`${where}: two options have the same text`);

  if (!q.correct) warn.push(`${where}: no "Correct Answer" line`);
  else if (!letters.includes(q.correct)) warn.push(`${where}: key is ${q.correct} but there is no option ${q.correct}`);

  const missing = letters.filter(L => q.feedback[L] === undefined);
  if (missing.length) warn.push(`${where}: no explanation for ${missing.join(', ')}`);
  const orphan = Object.keys(q.feedback).filter(L => !letters.includes(L));
  if (orphan.length) warn.push(`${where}: explanation for ${orphan.join(', ')} with no such option`);

  // The "(Correct)" marker sits on exactly one explanation and states the key a SECOND time.
  // It is the only independent witness to the key, so a disagreement means one side was
  // edited alone.
  if (!q.correctExplFor.length) warn.push(`${where}: no explanation carries the "(Correct)" marker`);
  else if (q.correctExplFor.length > 1) {
    warn.push(`${where}: ${q.correctExplFor.length} explanations carry the "(Correct)" marker `
      + `(${q.correctExplFor.join(', ')}) — used the answer-key line`);
  } else if (q.correct && q.correctExplFor[0] !== q.correct) {
    warn.push(`${where}: the answer key says ${q.correct} but the "(Correct)" marker sits on `
      + `explanation ${q.correctExplFor[0]} — one of the two was edited alone`);
  }

  if (!q.mapped) warn.push(`${where}: no "Mapped to" code`);
  else {
    if (!VIDEOS[q.mapped]) warn.push(`${where}: mapped to ${q.mapped}, which the outline has no video for`);
    else if (!q.mapped.startsWith(`M${cur.num}L`)) {
      warn.push(`${where}: mapped to ${q.mapped}, which is outside module ${cur.num} — the feedback `
        + 'would point the learner at another module. Move the question, or re-map it.');
    }
  }

  // The builder folds a leading "Scenario:" to "Scenario — "; any OTHER label-like opening
  // would still be read by the importer as an answer option.
  const afterFold = q.prompt.replace(/^\s*Scenario\s*:\s*/i, '');
  if (/^[A-Za-z][A-Za-z ]{0,24}:\s/.test(afterFold)) {
    warn.push(`${where}: the prompt starts with a label-like token, which the importer reads as `
      + `an answer option: "${afterFold.slice(0, 40)}"`);
  }

  cur.questions.push(q);
  q = null;
}

for (const n of MODULE_FILES) {
  const file = path.join(SP, SLUG, 'docs', 'm' + n, 'word', 'document.xml');
  if (!fs.existsSync(file)) { warn.push(`module ${n}: no document at ${file}`); continue; }
  pushQ();
  cur = null; mode = null; lastLetter = null;

  for (const line of lines(file)) {
    if (!line) continue;
    let m;

    if ((m = line.match(RE.module))) {
      pushQ();
      const num = +m[1];
      if (num !== n) warn.push(`file m${n} carries the heading "Module ${num}" — used ${num}`);
      const stated = clean(m[2]);
      const fromOutline = (MMETA['M' + num] || {}).title || '';
      if (!fromOutline) warn.push(`Module ${num}: the outline has no title for it`);
      else if (norm(stated) !== norm(fromOutline)) {
        warn.push(`Module ${num}: the quiz calls it "${stated}" but the outline calls it `
          + `"${fromOutline}" — used the outline's wording`);
      }
      cur = { num, title: fromOutline || stated, questions: [] };
      modules.push(cur);
      mode = null; q = null;
      continue;
    }

    if ((m = line.match(RE.q))) {
      pushQ();
      q = { num: 0, sourceNum: +m[1], prompt: '', _prompt: [], options: [], correct: null,
            correctExplFor: [], feedback: {}, mapped: '', hasScenario: false };
      if (m[2].trim()) q._prompt.push(m[2]);
      mode = 'head'; lastLetter = null;
      continue;
    }
    if (!q) continue;                                // document title lines, stray banners

    // "Options:" is a label. Sixteen questions put option A on it; the rest leave it bare.
    if ((m = line.match(RE.optlbl))) {
      mode = 'opts';
      const tail = m[1].trim();
      if (tail) {
        const got = splitOptions(tail, 'A');
        if (!got.length) { warn.push(`M${cur ? cur.num : '?'} src-Q${q.sourceNum}: text after "Options:" is not an option: "${tail.slice(0, 50)}"`); continue; }
        if (got.length > 1) warn.push(`M${cur ? cur.num : '?'} src-Q${q.sourceNum}: options ${got.map(o => o.letter).join('')} share the "Options:" line — split`);
        q.options.push(...got);
        lastLetter = got[got.length - 1].letter;
      }
      continue;
    }

    if ((m = line.match(RE.key))) {
      q.correct = m[1].toUpperCase();
      if (m[2]) q.mapped = m[2].toUpperCase();
      mode = 'key';
      continue;
    }
    if ((m = line.match(RE.mapped))) {
      if (q.mapped && q.mapped !== m[1].toUpperCase()) {
        warn.push(`M${cur ? cur.num : '?'} src-Q${q.sourceNum}: two different mappings, ${q.mapped} and ${m[1].toUpperCase()}`);
      }
      q.mapped = m[1].toUpperCase();
      mode = 'key';
      continue;
    }

    // Explanations before options: "Explanation for Option A…" also matches nothing else, and
    // testing it first means an option pattern can never claim one.
    if (/^Explanation for Option\s+[A-D]\b/i.test(line)) {
      const parts = splitExplanations(line);
      if (parts.length > 1) {
        warn.push(`M${cur ? cur.num : '?'} src-Q${q.sourceNum}: ${parts.length} explanations share one `
          + 'paragraph — split');
      }
      for (const part of parts) {
        const e = part.match(RE.expl);
        if (!e) { warn.push(`M${cur ? cur.num : '?'} src-Q${q.sourceNum}: unreadable explanation "${part.slice(0, 50)}"`); continue; }
        const L = e[1].toUpperCase();
        if (q.feedback[L] !== undefined) warn.push(`M${cur ? cur.num : '?'} src-Q${q.sourceNum}: two explanations for option ${L}`);
        if (!e[3]) warn.push(`M${cur ? cur.num : '?'} src-Q${q.sourceNum}: explanation for ${L} has no colon after the label`);
        q.feedback[L] = verbatim(e[4]);
        if (!q.feedback[L]) warn.push(`M${cur ? cur.num : '?'} src-Q${q.sourceNum}: explanation for ${L} is empty`);
        if (e[2] && /^correct$/i.test(e[2])) q.correctExplFor.push(L);
        lastLetter = L;
      }
      mode = 'fb';
      continue;
    }

    // "A. <option text>", possibly carrying B, C and D behind it.
    if (/^[A-D]\.[ \t]+/.test(line) && mode !== 'fb') {
      const expect = String.fromCharCode('A'.charCodeAt(0) + q.options.length);
      const got = splitOptions(line, line[0].toUpperCase());
      if (!got.length) { warn.push(`M${cur ? cur.num : '?'} src-Q${q.sourceNum}: unreadable option "${line.slice(0, 50)}"`); continue; }
      if (got[0].letter !== expect) {
        warn.push(`M${cur ? cur.num : '?'} src-Q${q.sourceNum}: option ${got[0].letter} arrives where ${expect} was expected`);
      }
      if (got.length > 1) {
        warn.push(`M${cur ? cur.num : '?'} src-Q${q.sourceNum}: options ${got.map(o => o.letter).join('')} share one `
          + 'paragraph — split');
      }
      q.options.push(...got);
      lastLetter = got[got.length - 1].letter;
      mode = 'opts';
      continue;
    }

    // Continuations. Before the first option every unmatched line is prompt; after it, a line
    // belongs to whichever option or explanation opened last. No line in the four documents
    // reaches here today — this is a guard against a future revision wrapping one.
    if (mode === 'head') { q._prompt.push(line); continue; }
    if (mode === 'fb' && lastLetter && q.feedback[lastLetter] !== undefined) {
      q.feedback[lastLetter] += ' ' + verbatim(line);
      continue;
    }
    if (mode === 'opts' && lastLetter) {
      const o = q.options.find(x => x.letter === lastLetter);
      if (o) { o.text += ' ' + verbatim(line); continue; }
    }
    warn.push(`M${cur ? cur.num : '?'} src-Q${q.sourceNum}: unplaced line "${line.slice(0, 50)}"`);
  }
}
pushQ();

for (const mo of modules) {
  if (mo.questions.length !== QUESTIONS_PER_MODULE) {
    warn.push(`Module ${mo.num}: ${mo.questions.length} questions, but the outline's Graded Quiz row `
      + `says ${QUESTIONS_PER_MODULE} per module`);
  }
}
if (modules.length !== MODULE_FILES.length) {
  warn.push(`${modules.length} module headings across ${MODULE_FILES.length} files`);
}

if (process.argv.includes('--report')) {
  modules.forEach(mo => {
    const lessons = new Set(mo.questions.map(x => (x.mapped.match(/^M\d+(L\d+)/) || [])[1]).filter(Boolean));
    const scen = mo.questions.filter(x => x.hasScenario).length;
    console.log(`Module ${mo.num} — ${mo.title}: ${mo.questions.length} questions, `
      + `${lessons.size} lessons covered, ${scen} scenario-framed`);
  });
  const all = modules.flatMap(mo => mo.questions);
  console.log(`\n${modules.length} modules · ${all.length} questions · `
    + `${all.reduce((a, x) => a + x.options.length, 0)} options · `
    + `${all.filter(x => x.mapped).length} mapped · `
    + `${all.reduce((a, x) => a + Object.keys(x.feedback).length, 0)} explanations · `
    + `${all.filter(x => x.hasScenario).length} scenarios`);
  const byLetter = {};
  for (const x of all) byLetter[x.correct] = (byLetter[x.correct] || 0) + 1;
  console.log('answer key spread: ' + Object.entries(byLetter).sort().map(([k, v]) => `${k}:${v}`).join(' '));
  const covered = new Set(all.map(x => x.mapped).filter(Boolean));
  const uncovered = Object.keys(VIDEOS).filter(k => !covered.has(k));
  console.log(`video coverage:    ${covered.size} of ${Object.keys(VIDEOS).length} videos referenced`
    + (uncovered.length ? ` · not referenced: ${uncovered.join(', ')}` : ''));
  console.log('longest prompt:    ' + Math.max(...all.map(x => x.prompt.length)) + ' characters');
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify(modules, null, 2));
}
