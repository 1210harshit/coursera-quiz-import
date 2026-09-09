// Parser for the Emotional Intelligence for Work and Life graded assessments (one file per module).
//
// Four source documents, m1..m4, in the one-file-per-module arrangement cstp-course-1 uses.
// Within a file the grammar is ai-products' family, and it is the same in all four:
//
//   Q1. What is the correct order of operations for connecting with another person?
//   A. Communicate first, then connect once agreement is reached
//   B. Connection and communication happen simultaneously and cannot be separated   <- C, D likewise
//   ✅ Correct Answer: C
//   Mapped to: M2L1V1
//   Explanation for Option C (Correct):
//   Connect first and communicate second. Connecting means you have to listen, …
//   Explanation for Other Options:
//   A: Most people have the order backward, which is what causes the failure.       <- B, D likewise
//
// A scenario question writes the label on the HEADER line and the scenario in the paragraph
// below it:
//
//   Q1. Scenario:
//   Two candidates apply for the same role with identical qualifications … Which principle
//   best explains that decision?
//
// The scenario paragraph already ends in the question, so the prompt is that ONE line and the
// "Scenario:" label never reaches it — it is part of the header, which is structure. Every
// prompt this parser emits is therefore a single line, the form the importer is happiest with.
// `hasScenario` records which questions were written that way.
//
// The one thing worth knowing about the source: module 1 is formatted differently from modules
// 2 to 4. It uses Heading4 paragraphs for its question headers and packs "Correct Answer" with
// "Mapped to", and each explanation label with its text, into single paragraphs split by
// <w:br/>. Modules 2 to 4 use plain paragraphs throughout and write those as separate ones.
// lib-lines splits on <w:br/>, so both arrive here as the identical line grammar above and no
// per-module special case is needed. lib-lines rather than lib-lines-strikeaware: there is no
// struck text in any of the four documents.
//
// The answer key is stated twice — once as "Correct Answer: C" and again by which option the
// "(Correct)" explanation label names. Neither is derived from the other, so the two are
// checked against each other; that is the only independent witness available, as in
// ai-products. A disagreement is fatal rather than a warning, because either reading would
// produce a plausible-looking document with the wrong option starred.
const fs = require('fs');
const path = require('path');
const { lines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'emotional-intelligence';
const MODULES = [1, 2, 3, 4];
const LET = ['A', 'B', 'C', 'D'];

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n`
    + 'The module titles and the mapping cross-check both come from the outline:\n'
    + `  node src/emotional-intelligence-parse-outline.js > ${outlinePath}`);
  process.exit(1);
}
const { map: VIDEOS, meta: MMETA } = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

// Content — prompts, options, explanations — reaches the import verbatim. Only the ends are
// trimmed and a non-breaking space folded, so a run of spaces inside a line stays the author's.
const text = s => String(s).replace(/ /g, ' ').replace(/^[ \t]+|[ \t]+$/g, '');

const Q_HEAD  = /^Q(\d+)\.\s*(.*)$/;
const SCENARIO = /^Scenario\s*:\s*$/i;
const OPTION  = /^([A-D])\.\s+(.+)$/;
const KEY     = /^\s*(?:✅\s*)?Correct Answer\s*:\s*([A-D])\b/i;
const MAPPED  = /^Mapped to\s*:\s*(M\d+L\d+V\d+)\b/i;
const EXPL_C  = /^Explanation for Option\s+([A-D])\s*\(Correct\)\s*:\s*(.*)$/i;
const EXPL_O  = /^Explanation for Other Options\s*:\s*$/i;
const EXPL_I  = /^([A-D])\s*:\s+(.+)$/;

const warn = [];
const modules = [];

for (const n of MODULES) {
  const src = path.join(SP, SLUG, `m${n}`, 'word', 'document.xml');
  if (!fs.existsSync(src)) {
    console.error(`ENOENT ${src}\nUnzip the module ${n} graded quiz first:\n`
      + `  unzip -q "EmotionalIntelligence_GradedAssessment_M${n}.docx" -d work/${SLUG}/m${n}`);
    process.exit(1);
  }
  const L = lines(src).map(text).filter(s => s.trim());

  const mmeta = MMETA['M' + n] || { title: '' };
  const mo = { num: n, title: mmeta.title, questions: [] };
  modules.push(mo);

  const starts = [];
  L.forEach((l, i) => { if (Q_HEAD.test(l)) starts.push(i); });
  if (!starts.length) { warn.push(`M${n}: no "Q<n>." headers found`); continue; }

  starts.forEach((start, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : L.length;
    const blk = L.slice(start, end);
    const head = blk[0].match(Q_HEAD);
    const sourceNum = +head[1];
    const where = `M${n} Q${sourceNum}`;

    const q = {
      num: k + 1, sourceNum,
      prompt: [], options: [], correct: null, correctExplFor: null,
      feedback: {}, mapped: '', hasScenario: false,
    };

    // ---- prompt ------------------------------------------------------------------------
    // Either the question is on the header line, or the header says "Scenario:" and the
    // paragraph below carries the whole thing.
    let i = 1;
    if (SCENARIO.test(head[2]) || !head[2]) {
      q.hasScenario = true;
      if (!SCENARIO.test(head[2])) warn.push(`${where}: header carries no question text`);
      // The "Scenario:" label is part of what the author wrote, so quiz.json records it. The
      // builder decides what reaches the import section — see emotional-intelligence-build.js, which joins
      // the prompt to one line and re-punctuates the label so the importer cannot read it as an
      // answer option.
      else q.prompt.push(head[2]);
      while (i < blk.length && !OPTION.test(blk[i])) { q.prompt.push(blk[i]); i++; }
    } else {
      q.prompt.push(head[2]);
      // Anything before the first option belongs to the prompt — a second paragraph would be
      // unusual here, but dropping it silently would lose source text.
      while (i < blk.length && !OPTION.test(blk[i])) { q.prompt.push(blk[i]); i++; }
    }
    if (!q.prompt.length) { warn.push(`${where}: no prompt — question skipped`); return; }

    // ---- options, key, mapping, explanations --------------------------------------------
    let mode = null, pendingLetter = null;
    for (; i < blk.length; i++) {
      const l = blk[i];
      let m;

      if ((m = l.match(OPTION)) && !q.correct && LET.includes(m[1])) {
        q.options.push({ letter: m[1], text: m[2] });
        continue;
      }
      if ((m = l.match(KEY)))    { q.correct = m[1].toUpperCase(); mode = null; continue; }
      if ((m = l.match(MAPPED))) { q.mapped = m[1].toUpperCase();  mode = null; continue; }
      if ((m = l.match(EXPL_C))) {
        q.correctExplFor = m[1].toUpperCase();
        pendingLetter = q.correctExplFor;
        // Module 1 puts the text on the same line as the label; modules 2-4 on the next.
        if (m[2] && m[2].trim()) { q.feedback[pendingLetter] = m[2].trim(); pendingLetter = null; }
        mode = 'correct';
        continue;
      }
      if (EXPL_O.test(l)) { mode = 'other'; pendingLetter = null; continue; }
      if (mode === 'other' && (m = l.match(EXPL_I))) {
        q.feedback[m[1].toUpperCase()] = m[2];
        continue;
      }
      if (mode === 'correct' && pendingLetter) { q.feedback[pendingLetter] = l; pendingLetter = null; continue; }
      // A continuation line of whichever explanation is open.
      if (mode && Object.keys(q.feedback).length) {
        const last = mode === 'correct' ? q.correctExplFor
          : Object.keys(q.feedback).filter(x => x !== q.correctExplFor).pop();
        if (last && q.feedback[last]) { q.feedback[last] += '\n' + l; continue; }
      }
      warn.push(`${where}: unmatched line "${l.slice(0, 60)}"`);
    }

    // ---- checks --------------------------------------------------------------------------
    const letters = q.options.map(o => o.letter).join('');
    if (letters !== 'ABCD') { warn.push(`${where}: options are "${letters}", expected ABCD — skipped`); return; }
    if (!q.correct) { warn.push(`${where}: no "Correct Answer:" line — skipped`); return; }
    if (!q.correctExplFor) { warn.push(`${where}: no "(Correct)" explanation label — skipped`); return; }
    // The two independent statements of the key. See the header comment.
    if (q.correct !== q.correctExplFor) {
      throw new Error(`${where}: the answer key disagrees with itself — "Correct Answer: ${q.correct}" `
        + `but the explanation labelled (Correct) is for ${q.correctExplFor}. `
        + 'Resolve it in the source; either reading would star a different option.');
    }
    const missing = LET.filter(x => !q.feedback[x]);
    if (missing.length) { warn.push(`${where}: no explanation for ${missing.join(', ')} — skipped`); return; }
    if (!q.mapped) { warn.push(`${where}: no "Mapped to:" line — skipped`); return; }
    if (!VIDEOS[q.mapped]) { warn.push(`${where}: mapping ${q.mapped} is not in the outline — skipped`); return; }
    if (VIDEOS[q.mapped].module !== n) {
      warn.push(`${where}: mapping ${q.mapped} points outside module ${n} — a question with no video `
        + 'in its own module is a content gap, not a mapping to repair');
    }
    if (q.sourceNum !== q.num) {
      warn.push(`${where}: numbered ${q.sourceNum} in the source but sits at position ${q.num}`);
    }

    mo.questions.push(q);
  });
}

// --- video coverage, against the outline's own claim ------------------------------------
// Every module's Graded Assessment row describes "a ten-question graded quiz drawing on every
// video in the module". Where that is not true the gap is named, because it is an editorial
// decision about the assessment rather than a parsing failure.
const coverage = [];
for (const mo of modules) {
  const used = new Set(mo.questions.map(q => q.mapped));
  const all = Object.keys(VIDEOS).filter(k => VIDEOS[k].module === mo.num);
  const unused = all.filter(k => !used.has(k));
  coverage.push({ num: mo.num, used: used.size, total: all.length, unused });
  if (unused.length) {
    warn.push(`M${mo.num}: no question references ${unused.join(', ')} — the outline describes this `
      + 'assessment as "drawing on every video in the module"');
  }
}

if (process.argv.includes('--report')) {
  let total = 0, scen = 0;
  const key = {};
  for (const mo of modules) {
    const cov = coverage.find(c => c.num === mo.num);
    const ls = new Set(mo.questions.map(q => VIDEOS[q.mapped] && VIDEOS[q.mapped].lesson));
    console.log(`Module ${mo.num} — ${mo.title}: ${mo.questions.length} questions, `
      + `${ls.size} lessons covered, ${cov.used} of ${cov.total} videos referenced`);
    total += mo.questions.length;
    for (const q of mo.questions) { key[q.correct] = (key[q.correct] || 0) + 1; if (q.hasScenario) scen++; }
  }
  const all = modules.flatMap(m => m.questions);
  const longest = all.flatMap(q => [...q.prompt, ...Object.values(q.feedback)])
    .reduce((a, s) => Math.max(a, s.length), 0);
  console.log(`\n${modules.length} modules · ${total} questions · ${all.filter(q => q.mapped).length} mapped · `
    + `${all.reduce((a, q) => a + Object.keys(q.feedback).length, 0)} explanations · ${scen} scenarios`);
  console.log(`answer key spread: ${LET.map(l => `${l}:${key[l] || 0}`).join(' ')}`);
  console.log(`video coverage:    ${coverage.reduce((a, c) => a + c.used, 0)} of `
    + `${coverage.reduce((a, c) => a + c.total, 0)} videos referenced`);
  console.log(`prompt lines:      ${all.filter(q => q.prompt.length > 1).length} questions use more than `
    + `one line, ${all.filter(q => q.prompt.length === 1).length} are one line`);
  console.log(`longest line:      ${longest} characters`);
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify(modules, null, 2));
}
