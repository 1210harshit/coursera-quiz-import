// Parser for the Managing People, Performance, and Change graded assessments.
//
// Four source documents, m1..m4, in the one-file-per-module arrangement cstp-course-1 uses
// and soft-skills follows. The line grammar is soft-skills' exactly — same labels, same
// order, same punctuation — so the regexes below are that parser's, unchanged:
//
//   Q2. <question stated on the header line>
//   A. <option text>
//   B. <option text>                                                        <- C, D likewise
//   ✅ Correct Answer: A
//   Mapped to: M1L1V1
//   Explanation for Option A (Correct):
//   <explanation for the correct option, on the line below its label>
//   Explanation for Other Options:
//   B: <explanation>                                                        <- C, D likewise
//
// The shapes above are placeholders on purpose. This file is public; the course content it
// reads is not, and a question printed beside its own answer key is the part that must not
// leak. Every structural detail a future editor needs — label spelling, punctuation, which
// line carries what — survives the substitution.
//
// A scenario question writes the label on the HEADER line and the scenario in the paragraphs
// below it, the soft-skills arrangement rather than ai-products':
//
//   Q1. Scenario:
//   <scenario paragraph, several sentences>
//   <the question itself, as its own paragraph>
//
// Here the scenario and the question are two SEPARATE paragraphs — ai-products' shape, not
// soft-skills', where the scenario paragraph already ends in the question. Both arrive as
// prompt lines and the builder joins them; `hasScenario` records which questions were written
// that way. 17 of the 40 questions are.
//
// All four documents are plain paragraphs throughout: no <w:br/>, no tables, no struck text,
// checked on every one. lib-lines is still the reader rather than a plain splitter, so a later
// revision that introduces breaks inside a paragraph keeps parsing.
//
// --- Why the outline is optional here, and mandatory in the builder ---------------------
//
// soft-skills and ai-products both refuse to run without outline.json, because the module
// titles and the mapping cross-check come from it. This source states its module title in its
// own second heading —
//
//   Module <n> – <module title>
//
// — so the parse needs nothing external, and refusing to run would block the whole read of 40
// questions on a document that is not needed to read them. The outline is therefore used when
// present and reported as absent when not:
//
//   present -> mapping validated against real videos, per-module coverage reported, and the
//              outline's module title preferred over the source's if the two disagree.
//   absent  -> mappings are checked for shape and for pointing inside their own module, which
//              is all that can be checked without one, and every question still parses.
//
// The BUILDER has no such latitude. Its feedback line ends "(Refer to M1L1V1: <video title>)"
// and the title exists only in the outline, so managing-build.js requires it. Parse now,
// build once the outline is in hand.
const fs = require('fs');
const path = require('path');
const { lines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'managing';
const MODULES = [1, 2, 3, 4];
const LET = ['A', 'B', 'C', 'D'];

// Optional — see the header comment. {} means "not supplied", not "empty outline".
const outlinePath = path.join(SP, SLUG, 'outline.json');
const haveOutline = fs.existsSync(outlinePath);
const { map: VIDEOS, meta: MMETA } = haveOutline
  ? JSON.parse(fs.readFileSync(outlinePath, 'utf8'))
  : { map: {}, meta: {} };

// Content — prompts, options, explanations — reaches the import verbatim. Only the ends are
// trimmed and a non-breaking space folded, so a run of spaces inside a line stays the author's.
const text = s => String(s).replace(/ /g, ' ').replace(/^[ \t]+|[ \t]+$/g, '');

const Q_HEAD   = /^Q(\d+)\.\s*(.*)$/;
const SCENARIO = /^Scenario\s*:\s*$/i;
const OPTION   = /^([A-D])\.\s+(.+)$/;
const KEY      = /^\s*(?:✅\s*)?Correct Answer\s*:\s*([A-D])\b/i;
const MAPPED   = /^Mapped to\s*:\s*(M\d+L\d+V\d+)\b/i;
const EXPL_C   = /^Explanation for Option\s+([A-D])\s*\(Correct\)\s*:\s*(.*)$/i;
const EXPL_O   = /^Explanation for Other Options\s*:\s*$/i;
const EXPL_I   = /^([A-D])\s*:\s+(.+)$/;
// "Module 1 – <title>". The separator is an en-dash in all four
// documents; hyphen and em-dash are accepted so a re-typed heading still matches.
const MOD_HEAD = /^Module\s+(\d+)\s*[–—-]\s*(.+)$/i;
// The mapping is the only place a code appears, so its module digit is the cross-check.
const CODE     = /^M(\d+)L(\d+)V(\d+)$/;

const warn = [];
const modules = [];

for (const n of MODULES) {
  const src = path.join(SP, SLUG, `m${n}`, 'word', 'document.xml');
  if (!fs.existsSync(src)) {
    console.error(`ENOENT ${src}\nUnzip the module ${n} graded assessment first:\n`
      + `  unzip -q "Managing_GradedAssessment_M${n}.docx" -d work/${SLUG}/m${n}`);
    process.exit(1);
  }
  const L = lines(src).map(text).filter(s => s.trim());

  const starts = [];
  L.forEach((l, i) => { if (Q_HEAD.test(l)) starts.push(i); });
  if (!starts.length) { warn.push(`M${n}: no "Q<n>." headers found`); continue; }

  // ---- module title ----------------------------------------------------------------------
  // From the source's own heading, which sits above the first question. The outline wins when
  // it is present and disagrees, since the workbook and the quiz must name the module alike.
  let title = '';
  for (const l of L.slice(0, starts[0])) {
    const m = l.match(MOD_HEAD);
    if (!m) continue;
    if (+m[1] !== n) warn.push(`M${n}: heading says "Module ${m[1]}" in the module ${n} document`);
    title = text(m[2]);
    break;
  }
  if (!title) warn.push(`M${n}: no "Module ${n} – Title" heading in the source`);
  const fromOutline = MMETA['M' + n] && MMETA['M' + n].title;
  if (fromOutline && title && fromOutline !== title) {
    warn.push(`M${n}: source heading "${title}" but the outline says "${fromOutline}" — using the outline`);
  }
  const mo = { num: n, title: fromOutline || title, questions: [] };
  modules.push(mo);

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
    // paragraphs below carry the scenario and then the question.
    let i = 1;
    if (SCENARIO.test(head[2]) || !head[2]) {
      q.hasScenario = true;
      if (!SCENARIO.test(head[2])) warn.push(`${where}: header carries no question text`);
      // The "Scenario:" label is part of what the author wrote, so quiz.json records it. The
      // builder decides what reaches the import section — see managing-build.js, which joins
      // the prompt to one line and re-punctuates the label so the importer cannot read it as an
      // answer option.
      else q.prompt.push(head[2]);
      while (i < blk.length && !OPTION.test(blk[i])) { q.prompt.push(blk[i]); i++; }
    } else {
      q.prompt.push(head[2]);
      // Anything before the first option belongs to the prompt.
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
        // Label and text are separate paragraphs in all four documents; the same-line form is
        // accepted anyway, as soft-skills module 1 writes it that way.
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
    // The key is stated twice — as "Correct Answer: C" and by which option the "(Correct)"
    // explanation names. Neither is derived from the other, so they are the only independent
    // witnesses available. A disagreement is fatal, not a warning: either reading produces a
    // plausible-looking document with the wrong option starred.
    if (q.correct !== q.correctExplFor) {
      throw new Error(`${where}: the answer key disagrees with itself — "Correct Answer: ${q.correct}" `
        + `but the explanation labelled (Correct) is for ${q.correctExplFor}. `
        + 'Resolve it in the source; either reading would star a different option.');
    }
    const missing = LET.filter(x => !q.feedback[x]);
    if (missing.length) { warn.push(`${where}: no explanation for ${missing.join(', ')} — skipped`); return; }
    if (!q.mapped) { warn.push(`${where}: no "Mapped to:" line — skipped`); return; }

    // Mapping checks. With an outline the code is resolved against real videos; without one
    // the module digit is still checkable, and that is the error that matters most — a
    // question filed under the wrong module imports into the wrong quiz.
    if (haveOutline) {
      if (!VIDEOS[q.mapped]) { warn.push(`${where}: mapping ${q.mapped} is not in the outline — skipped`); return; }
      if (VIDEOS[q.mapped].module !== n) {
        warn.push(`${where}: mapping ${q.mapped} points outside module ${n} — a question with no video `
          + 'in its own module is a content gap, not a mapping to repair');
      }
    } else {
      const c = q.mapped.match(CODE);
      if (+c[1] !== n) {
        warn.push(`${where}: mapping ${q.mapped} points outside module ${n} — a question with no video `
          + 'in its own module is a content gap, not a mapping to repair');
      }
    }
    if (q.sourceNum !== q.num) {
      warn.push(`${where}: numbered ${q.sourceNum} in the source but sits at position ${q.num}`);
    }

    mo.questions.push(q);
  });
}

// --- video coverage ----------------------------------------------------------------------
// Only meaningful against the outline, which is what says how many videos a module has.
// Without one the distinct codes referenced are still worth reporting, since a module that
// draws all ten questions from two videos is an editorial fact whether or not it is a defect.
const coverage = [];
for (const mo of modules) {
  const used = new Set(mo.questions.map(q => q.mapped));
  if (haveOutline) {
    const all = Object.keys(VIDEOS).filter(k => VIDEOS[k].module === mo.num);
    const unused = all.filter(k => !used.has(k));
    coverage.push({ num: mo.num, used: used.size, total: all.length, unused });
    if (unused.length) {
      warn.push(`M${mo.num}: no question references ${unused.join(', ')}`);
    }
  } else {
    coverage.push({ num: mo.num, used: used.size, total: null, unused: [] });
  }
}

if (!haveOutline) {
  warn.push('outline.json absent — mappings checked for shape and module only, module titles taken '
    + 'from the source headings, and video coverage not checked. managing-build.js will require it.');
}

if (process.argv.includes('--report')) {
  let total = 0, scen = 0;
  const key = {};
  for (const mo of modules) {
    const cov = coverage.find(c => c.num === mo.num);
    const codes = [...new Set(mo.questions.map(q => q.mapped))].sort();
    console.log(`Module ${mo.num} — ${mo.title}: ${mo.questions.length} questions, `
      + (cov.total === null ? `${cov.used} videos referenced (${codes.join(', ')})`
                            : `${cov.used} of ${cov.total} videos referenced`));
    total += mo.questions.length;
    for (const q of mo.questions) { key[q.correct] = (key[q.correct] || 0) + 1; if (q.hasScenario) scen++; }
  }
  const all = modules.flatMap(m => m.questions);
  const longest = all.flatMap(q => [...q.prompt, ...Object.values(q.feedback)])
    .reduce((a, s) => Math.max(a, s.length), 0);
  console.log(`\n${modules.length} modules · ${total} questions · ${all.filter(q => q.mapped).length} mapped · `
    + `${all.reduce((a, q) => a + Object.keys(q.feedback).length, 0)} explanations · ${scen} scenarios`);
  console.log(`answer key spread: ${LET.map(l => `${l}:${key[l] || 0}`).join(' ')}`);
  console.log(`outline:           ${haveOutline ? outlinePath : 'not supplied — see warnings'}`);
  console.log(`prompt lines:      ${all.filter(q => q.prompt.length > 1).length} questions use more than `
    + `one line, ${all.filter(q => q.prompt.length === 1).length} are one line`);
  console.log(`longest line:      ${longest} characters`);
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify(modules, null, 2));
}
