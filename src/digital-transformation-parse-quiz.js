// Parser for the Digital Transformation Foundation and Strategy graded quiz (Course 1).
//
// One document holds all three modules, split by "Module N - Title" headings, in the shape
// google-ads-final uses. Within a module the grammar is soft-skills' and ai-products':
//
//   Module 1 - Digital Transformation Fundamentals and Strategic Context
//   Q1. Digital transformation is driven by the interaction of three broad forces. Which set …
//   A.	Marketing, sales, and public relations pressures.
//   B.	Hardware, software, networking, and storage upgrades.          <- C, D likewise
//   ✅ Correct Answer: C
//   Mapped to: M1L1V1
//   Explanation for Option C (Correct): Transformation drivers are grouped into …
//   Explanation for Other Options:
//   A: These are functional activities, not the strategic forces that drive transformation.
//
// Question numbers restart at 1 in each module, so the source number is also the position and
// the two are checked against each other.
//
// Three things are this source's own:
//
//   * THE OPTION SEPARATOR IS NOT RELIABLE. Most options put a tab between the letter and the
//     text ("A.\tMarketing, sales…"), but 22 of the 120 have nothing at all
//     ("C.The size of the technology budget they consumed."). The letter pattern therefore ends
//     `\s*`, not `\s+`. With `\s+` those 22 options simply do not match, which does not error —
//     it silently yields a question with two or three options, and the count check below is
//     what would catch it. The tab itself is a literal character inside <w:t>, not a <w:tab/>
//     element, so lib-lines carries it through and it is consumed as the separator.
//   * "Scenario:" is INLINE, on the question line itself ("Q2. Scenario: Two competitors buy…"),
//     where soft-skills puts it on the header alone. It is kept in quiz.json, because that is
//     the source's own wording, and dropped by the builder — the importer reads a line starting
//     `word:` as an answer option, which is the osha failure. Nine of the thirty are written
//     this way.
//   * every explanation states its text on the SAME line as its label, correct and incorrect
//     alike, so no continuation handling is needed for the common case.
//
// The answer key is stated twice — as "Correct Answer: C" and by which option the "(Correct)"
// explanation names. Neither derives from the other, so the two are checked against each other
// and a disagreement is fatal, as in ai-products: either reading would produce a plausible
// document with the wrong option starred.
const fs = require('fs');
const path = require('path');
const { lines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'digital-transformation';
const LET = ['A', 'B', 'C', 'D'];

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n`
    + 'The module titles and the mapping cross-check both come from the outline:\n'
    + `  node src/digital-transformation-parse-outline.js > ${outlinePath}`);
  process.exit(1);
}
const { map: VIDEOS, meta: MMETA } = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

// Content reaches the import verbatim. Only the ends are trimmed and a non-breaking space
// folded, so a run of spaces inside a line stays the author's.
const text = s => String(s).replace(/ /g, ' ').replace(/^[ \t]+|[ \t]+$/g, '');

const MODULE  = /^Module\s+(\d+)\s*[-–—:]\s*(.+)$/i;
const Q_HEAD  = /^Q(\d+)\.\s*(.*)$/;
const SCENARIO = /^Scenario\s*:\s*/i;
// See the header: the separator after the letter may be a tab, a space, or nothing at all.
const OPTION  = /^([A-D])\.\s*(.+)$/;
const KEY     = /^\s*(?:✅\s*)?Correct Answer\s*:\s*([A-D])\b/i;
const MAPPED  = /^Mapped to\s*:\s*(M\d+L\d+V\d+)\b/i;
const EXPL_C  = /^Explanation for Option\s+([A-D])\s*\(Correct\)\s*:\s*(.*)$/i;
const EXPL_O  = /^Explanation for Other Options\s*:\s*$/i;
const EXPL_I  = /^([A-D])\s*:\s*(.+)$/;

const warn = [];
const modules = [];

const src = path.join(SP, SLUG, 'quiz', 'word', 'document.xml');
if (!fs.existsSync(src)) {
  console.error(`ENOENT ${src}\nUnzip the graded quiz first:\n`
    + `  unzip -q "Graded_Quiz_Digital_Transformation.docx" -d work/${SLUG}/quiz`);
  process.exit(1);
}
const L = lines(src).map(text).filter(s => s.trim());

// --- split into modules -------------------------------------------------------------------
const modStarts = [];
L.forEach((l, i) => { if (MODULE.test(l)) modStarts.push(i); });
if (!modStarts.length) { console.error('no "Module N - Title" headings found'); process.exit(1); }

modStarts.forEach((mStart, mi) => {
  const mEnd = mi + 1 < modStarts.length ? modStarts[mi + 1] : L.length;
  const mh = L[mStart].match(MODULE);
  const n = +mh[1];
  const sourceTitle = mh[2].trim();
  const outlineTitle = (MMETA['M' + n] || {}).title || '';
  // The outline is the authority for the title that reaches the built document; a disagreement
  // is reported rather than silently resolved.
  if (outlineTitle && sourceTitle && outlineTitle !== sourceTitle) {
    warn.push(`M${n}: quiz heading says "${sourceTitle}" but the outline says "${outlineTitle}" — `
      + 'the outline title is used');
  }
  const mo = { num: n, title: outlineTitle || sourceTitle, questions: [] };
  modules.push(mo);

  const body = L.slice(mStart + 1, mEnd);
  const starts = [];
  body.forEach((l, i) => { if (Q_HEAD.test(l)) starts.push(i); });
  if (!starts.length) { warn.push(`M${n}: no "Q<n>." headers found`); return; }

  starts.forEach((start, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : body.length;
    const blk = body.slice(start, end);
    const head = blk[0].match(Q_HEAD);
    const sourceNum = +head[1];
    const where = `M${n} Q${sourceNum}`;

    const q = {
      num: k + 1, sourceNum,
      prompt: [], options: [], correct: null, correctExplFor: null,
      feedback: {}, mapped: '', hasScenario: false,
    };

    // ---- prompt --------------------------------------------------------------------------
    // The question is on the header line. "Scenario:" is part of that line here, and is kept:
    // quiz.json records the source, and the builder is what drops the label.
    if (head[2].trim()) q.prompt.push(head[2].trim());
    q.hasScenario = SCENARIO.test(head[2] || '');
    let i = 1;
    while (i < blk.length && !OPTION.test(blk[i]) && !KEY.test(blk[i])) { q.prompt.push(blk[i]); i++; }
    if (!q.prompt.length) { warn.push(`${where}: no prompt — question skipped`); return; }

    // ---- options, key, mapping, explanations ----------------------------------------------
    let mode = null, pendingLetter = null;
    for (; i < blk.length; i++) {
      const l = blk[i];
      let m;

      if (!q.correct && (m = l.match(OPTION)) && LET.includes(m[1])) {
        q.options.push({ letter: m[1], text: m[2] });
        continue;
      }
      if ((m = l.match(KEY)))    { q.correct = m[1].toUpperCase(); mode = null; continue; }
      if ((m = l.match(MAPPED))) { q.mapped = m[1].toUpperCase();  mode = null; continue; }
      if ((m = l.match(EXPL_C))) {
        q.correctExplFor = m[1].toUpperCase();
        pendingLetter = q.correctExplFor;
        if (m[2] && m[2].trim()) { q.feedback[pendingLetter] = m[2].trim(); pendingLetter = null; }
        mode = 'correct';
        continue;
      }
      if (EXPL_O.test(l)) { mode = 'other'; pendingLetter = null; continue; }
      if (mode === 'other' && (m = l.match(EXPL_I))) { q.feedback[m[1].toUpperCase()] = m[2]; continue; }
      if (mode === 'correct' && pendingLetter) { q.feedback[pendingLetter] = l; pendingLetter = null; continue; }
      // A continuation line of whichever explanation is open.
      if (mode && Object.keys(q.feedback).length) {
        const last = mode === 'correct' ? q.correctExplFor
          : Object.keys(q.feedback).filter(x => x !== q.correctExplFor).pop();
        if (last && q.feedback[last]) { q.feedback[last] += '\n' + l; continue; }
      }
      warn.push(`${where}: unmatched line "${l.slice(0, 60)}"`);
    }

    // ---- checks ----------------------------------------------------------------------------
    const letters = q.options.map(o => o.letter).join('');
    if (letters !== 'ABCD') { warn.push(`${where}: options are "${letters}", expected ABCD — skipped`); return; }
    if (!q.correct) { warn.push(`${where}: no "Correct Answer:" line — skipped`); return; }
    if (!q.correctExplFor) { warn.push(`${where}: no "(Correct)" explanation label — skipped`); return; }
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
});

// --- video coverage, against the outline's own claim ---------------------------------------
// The supplementary Graded Quiz row describes "30 questions, 10 from each module". Whether every
// video is reached is an editorial matter, so it is named rather than failed.
const coverage = [];
for (const mo of modules) {
  const used = new Set(mo.questions.map(q => q.mapped));
  const all = Object.keys(VIDEOS).filter(k => VIDEOS[k].module === mo.num);
  const unused = all.filter(k => !used.has(k));
  coverage.push({ num: mo.num, used: used.size, total: all.length, unused });
  if (unused.length) warn.push(`M${mo.num}: no question references ${unused.join(', ')}`);
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
    + `${all.reduce((a, q) => a + q.options.length, 0)} options · `
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
