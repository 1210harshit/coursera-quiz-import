// Parser for the GenAI for Product Designers graded quiz.
//
// Paragraph-based, in the family of google-ads-final, with the mapping and the answer key
// stated together on ONE line:
//
//   Module 1: AI Product Thinking, Scoping, and Solution Design   <- heading carries the title
//   Course: GenAI for Product Designers              <- repeated under each module
//   Q1.                                                           <- numbered 1-20 across the doc
//   Scenario: Six months after launching an AI ticket-routing …   <- own paragraph
//   Which characteristic of AI products best explains this …      <- own paragraph
//   A. A deterministic bug from before launch surfacing now
//   B. The world shifts while the model stays static              <- … C and D likewise
//   ✅ Correct Answer: B     Mapped to: M1L1V1
//   A: Deterministic bugs cause consistent, repeatable defects, … <- one explanation per option
//   B (Correct): Data and user behavior drift while the static …
//
// Three things are its own:
//
//   * the key and the mapping share a line. Every other course states them separately, so a
//     disagreement between the two was always detectable; here a single mistyped line loses
//     both. The "(Correct)" marker on one explanation states the key a SECOND time, and that
//     is checked against the "Correct Answer:" line — the only independent witness available.
//   * option labels use "A." and explanation labels use "A:". One character distinguishes an
//     option from its explanation, which is why both patterns are anchored and punctuation-
//     specific rather than sharing a single letter-label pattern.
//   * questions run 1-20 across the document and are renumbered 1-10 per module, as genai-pm
//     does. The source number is kept and checked against the position, so a question moved
//     between modules without renumbering is reported.
//
// The scenario and the question are SEPARATE PARAGRAPHS here, where google-ads-final has them
// in one paragraph split by <w:br/>. Both reach the builder the same way — as an array of
// lines, each becoming its own paragraph — so the source's split is preserved either way.
// Only the leading "Scenario:" label is dropped, and only by the builder: the importer reads a
// line starting `word:` as an answer option. quiz.json keeps the source wording.
//
// Text is otherwise passed through verbatim. Only leading and trailing whitespace is removed,
// which the verifier requires; runs of spaces inside a line are the author's and survive.
const fs = require('fs');
const path = require('path');
const { lines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'genai-product-design';

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n` +
    'The reference line and the module-title cross-check both come from the outline:\n' +
    `  node src/genai-product-design-parse-outline.js > ${outlinePath}`);
  process.exit(1);
}
const { map: VIDEOS, meta: MMETA } = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

const raw = lines(path.join(SP, SLUG, 'quiz', 'word', 'document.xml'));

// For metadata — mapping codes, module titles — where collapsing whitespace is harmless.
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

const QUESTIONS_PER_MODULE = 10;          // stated in the source's own subtitle line

const modules = [];
const warn = [];
let cur = null, q = null, mode = null, lastLetter = null;

function pushQ() {
  if (!q) return;
  if (!cur) { warn.push(`question ${q.sourceNum} before any module heading — dropped`); q = null; return; }

  // Every prompt here is a single line: the question sits on the "Q<n>." header and the source
  // writes no separate scenario paragraph. The array form is kept anyway, because a later
  // revision is free to add one and the builder already renders each line as its own paragraph.
  const parts = q._prompt.map(verbatim).filter(Boolean);
  q.prompt = parts.length === 1 ? parts[0] : parts;
  // A scenario is marked INLINE as "[Scenario] ", not with ai-products' "Scenario:" label on a
  // line of its own. The bracket matters: the importer reads a prompt opening `Word:` as an
  // answer option, and "[Scenario]" opens with "[", so unlike a bare label it is safe to keep.
  q.hasScenario = /^\s*\[\s*Scenario\s*\]/i.test(parts[0] || '');
  delete q._prompt;

  q.num = cur.questions.length + 1;
  const where = `M${cur.num} Q${q.num} (source Q${q.sourceNum})`;

  const promptLines = Array.isArray(q.prompt) ? q.prompt : [q.prompt];
  if (!promptLines.filter(Boolean).length) warn.push(`${where}: no prompt`);

  // Numbering runs 1-20 across the document, so the expected source number is the module's
  // offset plus the position. A mismatch means a question was moved or inserted without
  // renumbering, which is worth naming — the renumbering itself is deliberate.
  const expected = (cur.num - 1) * QUESTIONS_PER_MODULE + q.num;
  if (q.sourceNum === null) warn.push(`${where}: no "Q<n>." label`);
  else if (q.sourceNum !== expected) {
    warn.push(`${where}: numbered Q${q.sourceNum} in the document but sits where Q${expected} `
      + 'should be — a question was moved or inserted without renumbering');
  }

  if (q.options.length !== 4) warn.push(`${where}: ${q.options.length} options`);
  if (!q.correct) warn.push(`${where}: no "Correct Answer" line`);
  else if (!q.options.some(o => o.letter === q.correct)) {
    warn.push(`${where}: key is ${q.correct} but there is no option ${q.correct}`);
  }

  const missing = q.options.map(o => o.letter).filter(L => !q.feedback[L]);
  if (missing.length) warn.push(`${where}: no explanation for ${missing.join(', ')}`);

  // Exactly one option's feedback opens with "Correct.", and that states the key a second time.
  // It is the only independent witness here, because the key and the mapping share a line: a
  // single mistyped line would otherwise lose both with nothing to check it against.
  if (!q.correctExplFor) warn.push(`${where}: no feedback block opens with "Correct."`);
  else if (q.correct && q.correctExplFor !== q.correct) {
    warn.push(`${where}: the answer key says ${q.correct} but the feedback opening "Correct." is `
      + `the one for option ${q.correctExplFor} — one of the two was edited alone`);
  }
  if (q.correctMarkers.length > 1) {
    warn.push(`${where}: ${q.correctMarkers.length} feedback blocks open with "Correct." `
      + `(${q.correctMarkers.join(', ')}) — used the answer-key line`);
  }

  if (!q.mapped) warn.push(`${where}: no "Mapped to" code on the answer line`);
  else {
    if (!VIDEOS[q.mapped]) warn.push(`${where}: mapped to ${q.mapped}, which the outline has no video for`);
    if (!q.mapped.startsWith(`M${cur.num}L`)) {
      warn.push(`${where}: mapped to ${q.mapped}, which is outside module ${cur.num} — the feedback `
        + 'would point the learner at another module. Move the question, or re-map it.');
    }
  }

  // The builder drops a leading "[Scenario]" marker from the FIRST line only; a label-like token
  // anywhere else, or on a later line, would still be read by the importer as an answer option.
  promptLines.forEach((line, i) => {
    const text = i === 0 ? String(line).replace(/^\s*\[\s*Scenario\s*\]\s*/i, '') : line;
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

  // "Module 1: AI Product Thinking, Scoping, and Solution Design". The subtitle line
  // "Modules 1 and 2 - 20 questions, 10 per module" does not match: "Modules" leaves no
  // whitespace after "Module".
  if ((m = line.match(/^Module\s+(\d+)\s*[:\-–—]\s*(.+)$/i))) {
    pushQ();
    const num = +m[1];
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

  // "Q1.  Which statement best describes …" — the question is ON the header line here, where
  // ai-products put the number alone and the prompt on the paragraphs below. Whatever follows
  // the period opens the prompt; a bare "Q1." still works and simply starts an empty one.
  if ((m = line.match(/^Q\s*(\d+)\s*\.\s*([\s\S]*)$/i))) {
    pushQ();
    q = { num: 0, sourceNum: +m[1], prompt: '', _prompt: [], options: [], correct: null,
          correctExplFor: null, correctMarkers: [], feedback: {}, mapped: '',
          hasScenario: false, cognitive: '' };
    if (m[2] && m[2].trim()) q._prompt.push(m[2]);
    mode = 'head'; lastLetter = null;
    continue;
  }
  if (!q) continue;                                  // document title lines, "Course: …" banners

  // "Correct Answer: C    |    Mapped to: M1L1V1    |    Cognitive level: Understand" — three
  // fields on one pipe-delimited line. Each half after the key is optional so a line missing one
  // still yields what it does state, and the miss is reported rather than failing the parse.
  //
  // "Cognitive level" is this source's own field, and it is guidance for the course team: it
  // names the Bloom level the question targets. It is captured for the report and never reaches
  // the import section, in the way soft-skills treats "Skill assessed".
  if ((m = line.match(/^\s*(?:✅\s*)?Correct Answer\s*:\s*\(?([A-D])\)?\s*(?:[-–—|]\s*)?(?:Mapped to\s*:\s*(M\d+L\d+V\d+))?\s*(?:[-–—|]\s*)?(?:Cognitive level\s*:\s*([A-Za-z][A-Za-z ]*?))?\s*$/i))) {
    q.correct = m[1].toUpperCase();
    if (m[2]) q.mapped = m[2].toUpperCase();
    if (m[3]) q.cognitive = clean(m[3]);
    mode = 'key';
    continue;
  }

  // "A. <option text>" — the period is what makes this an option rather than an explanation.
  if ((m = line.match(/^([A-D])\.\s+([\s\S]*)$/))) {
    q.options.push({ letter: m[1], text: verbatim(m[2]) });
    lastLetter = m[1];
    mode = 'opts';
    continue;
  }

  // "Feedback: <text>" — carries NO letter. It belongs to the option immediately above, which is
  // paid-social's positional form in paragraph shape rather than table rows. Order is therefore
  // load-bearing: a feedback line that arrives before any option is a source defect, not a
  // continuation, so it is reported rather than silently attached to the previous question.
  //
  // The correct option's feedback opens with the word "Correct." That is the key's only
  // independent witness here, standing in for ai-products' "(Correct)" explanation label, and
  // pushQ checks it against the "Correct Answer:" line.
  if ((m = line.match(/^Feedback\s*:\s*([\s\S]*)$/i))) {
    const where = `M${cur ? cur.num : '?'} src-Q${q.sourceNum}`;
    if (!lastLetter) { warn.push(`${where}: a "Feedback:" line before any option — dropped`); continue; }
    const L = lastLetter;
    if (q.feedback[L]) warn.push(`${where}: two "Feedback:" blocks for option ${L}`);
    q.feedback[L] = verbatim(m[1]);
    if (/^\s*Correct\b/i.test(m[1])) { q.correctExplFor = q.correctExplFor || L; q.correctMarkers.push(L); }
    mode = 'fb';
    continue;
  }

  // Continuations. Before the first option every unmatched line is prompt; after it, a line
  // belongs to whichever option or explanation opened last.
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
pushQ();

for (const mo of modules) {
  if (mo.questions.length !== QUESTIONS_PER_MODULE) {
    warn.push(`Module ${mo.num}: ${mo.questions.length} questions, but the source's own subtitle `
      + `says ${QUESTIONS_PER_MODULE} per module`);
  }
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
    + `${all.filter(x => x.mapped).length} mapped · `
    + `${all.reduce((a, x) => a + Object.keys(x.feedback).length, 0)} explanations · `
    + `${all.filter(x => x.hasScenario).length} scenarios`);
  const spread = o => Object.entries(o).sort().map(([k, v]) => `${k}:${v}`).join(' ');
  const byLetter = {};
  for (const x of all) byLetter[x.correct] = (byLetter[x.correct] || 0) + 1;
  console.log('answer key spread: ' + spread(byLetter));
  const covered = new Set(all.map(x => x.mapped).filter(Boolean));
  const uncovered = Object.keys(VIDEOS).filter(k => !covered.has(k));
  console.log(`video coverage:    ${covered.size} of ${Object.keys(VIDEOS).length} videos referenced`
    + (uncovered.length ? ` · not referenced: ${uncovered.join(', ')}` : ''));
  const promptOf = x => (Array.isArray(x.prompt) ? x.prompt : [x.prompt]);
  console.log('prompt lines:      ' + all.filter(x => promptOf(x).length > 1).length
    + " questions keep the source's two-line split, "
    + all.filter(x => promptOf(x).length === 1).length + ' are one line');
  console.log('longest line:      ' + Math.max(...all.flatMap(x => promptOf(x).map(l => l.length))) + ' characters');
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify(modules, null, 2));
}
