// Parser for the PM Course 4 graded assessment (Agile Project Management in Practice).
// One document holds all three modules, split by "Module N – Title" headings.
//
//   Module 1 – Agile Mindset & Transition from Waterfall
//   Q1
//   Lesson Title: Values, Principles, and the Agile Mindset
//   Video: Agile Values Overview
//   Question Type: Understand
//   What is a key principle of the Agile mindset?
//   A. Prioritizing customer collaboration and adaptive delivery.      <- B, C, D likewise
//   ✅ Correct Answer: A
//   Mapped to: M1L1V1
//   Explanation for Option A (Correct):
//   Agile emphasizes collaboration, adaptability, and continuous delivery of value …
//   Explanation for Other Options:
//   B: Agile supports adaptability rather than rigid planning.         <- C, D likewise
//
// The grammar below the header is soft-skills' and growing-business's. What this source adds
// is THREE METADATA LINES between the question number and the prompt, and one of them is worth
// more than context:
//
//   * "Video: <title>" names the video the question is drawn from, in words. "Mapped to:"
//     names it again as a code. Neither derives from the other, so the title is resolved
//     against the outline and compared with the code — the only independent check this source
//     offers on its own mapping, and the one paid-ads-11 showed is worth making: there the two
//     disagreed on 17 of 110 questions and the codes were the stale side.
//   * "Lesson Title:" is checked the same way, against the lesson the code resolves to.
//   * "Question Type:" is the Bloom level. Captured for the Guide Section; never imported.
//
// Ten of the thirty questions open "Scenario: " and run to two lines. Both are hazards this
// repository has paid for — a prompt line beginning `word:` is read by the importer as an
// answer option, and a second prompt paragraph failed a whole document on Growing and
// Transforming Your Business. The parser records the source as written; pm-course-4-build.js
// folds the label to "Scenario — " and is run with --join-prompt.
//
// Content passes through with only leading and trailing whitespace removed.
const fs = require('fs');
const path = require('path');
const { lines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'pm-course-4';

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n`
    + 'The module titles, every reference and the title cross-check come from the outline:\n'
    + `  node src/${SLUG}-parse-outline.js > ${outlinePath}`);
  process.exit(1);
}
const { map: VIDEOS, meta: MMETA } = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

const DOCDIR = path.join(SP, SLUG, 'docs');
const DOCS = fs.readdirSync(DOCDIR)
  .map(name => path.join(DOCDIR, name, 'word', 'document.xml'))
  .filter(f => fs.existsSync(f));
if (DOCS.length !== 1) throw new Error('expected exactly one assessment document under ' + DOCDIR);

const verbatim = s => String(s).replace(/ /g, ' ').replace(/^[ \t]+|[ \t]+$/g, '');
const clean = s => String(s).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
// Matching-only: case, curly quotes, dashes and ampersands. Never written back.
const norm = s => clean(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/\s*&\s*/g, ' and ').replace(/[.,:;]+$/, '').replace(/\s+/g, ' ').toLowerCase();

const MODULE  = /^Module\s+(\d+)\s*[:.\-–—]\s*(.+)$/i;
const Q_HEAD  = /^Q\.?\s*(\d+)\s*$/i;
const LESSON  = /^Lesson Title\s*:\s*(.+)$/i;
const VIDEO   = /^Video\s*:\s*(.+)$/i;
const QTYPE   = /^Question Type\s*:\s*(.+)$/i;
const OPTION  = /^([A-D])\.\s+(.+)$/;
const KEY     = /^[^A-Za-z]*Correct Answer\s*:\s*\(?([A-D])\)?\b/i;
const MAPPED  = /^Mapped to\s*:\s*(?:C\d+)?(M\d+L\d+V\d+)\b/i;
const EXPL_C  = /^Explanation for Option\s+([A-D])\s*\(\s*Correct\s*\)\s*:\s*(.*)$/i;
const EXPL_O  = /^Explanation for Other Options\s*:\s*$/i;
const EXPL_I  = /^([A-D])\s*:\s+(.+)$/;

const warn = [];
const notes = [];
const modules = [];

const L = lines(DOCS[0]).map(verbatim).filter(s => s.trim());

const modStarts = [];
L.forEach((l, i) => { if (MODULE.test(clean(l))) modStarts.push(i); });
if (!modStarts.length) { console.error('no "Module N" heading anywhere in the document'); process.exit(1); }

modStarts.forEach((mStart, mi) => {
  const mEnd = mi + 1 < modStarts.length ? modStarts[mi + 1] : L.length;
  const mh = clean(L[mStart]).match(MODULE);
  const n = +mh[1];
  const sourceTitle = mh[2].trim();
  const mmeta = MMETA['M' + n] || { title: '', lessons: {} };
  if (mmeta.title && sourceTitle && norm(mmeta.title) !== norm(sourceTitle)) {
    warn.push(`M${n}: the assessment heading says "${sourceTitle}" but the outline says `
      + `"${mmeta.title}" — the outline title is used`);
  }
  const mo = { num: n, title: mmeta.title || sourceTitle, questions: [] };
  modules.push(mo);

  const body = L.slice(mStart + 1, mEnd);
  const starts = [];
  body.forEach((l, i) => { if (Q_HEAD.test(clean(l))) starts.push(i); });
  if (!starts.length) { warn.push(`M${n}: no "Q<n>" header found`); return; }

  starts.forEach((start, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : body.length;
    const blk = body.slice(start, end);
    const sourceNum = +clean(blk[0]).match(Q_HEAD)[1];
    const where = `M${n} Q${sourceNum}`;

    const q = {
      num: k + 1, sourceNum,
      prompt: '', _prompt: [],
      options: [], correct: null, correctExplFor: [], feedback: {},
      mapped: '', mappedAll: [], bloom: '', statedVideo: '', statedLesson: '',
      hasScenario: false,
    };

    let mode = 'meta', pending = null;
    for (let i = 1; i < blk.length; i++) {
      const line = blk[i];
      const t = clean(line);
      let m;

      if ((m = t.match(LESSON))) { q.statedLesson = m[1].trim(); continue; }
      if ((m = t.match(VIDEO)))  { q.statedVideo = m[1].trim(); mode = 'meta'; continue; }
      if ((m = t.match(QTYPE)))  { q.bloom = m[1].trim(); mode = 'prompt'; continue; }
      if ((m = t.match(KEY)))    { q.correct = m[1].toUpperCase(); mode = 'key'; pending = null; continue; }
      if ((m = t.match(MAPPED))) {
        q.mapped = m[1].toUpperCase(); q.mappedAll = [q.mapped]; mode = 'key'; continue;
      }
      if ((m = t.match(EXPL_C))) {
        q.correctExplFor.push(m[1].toUpperCase());
        if (m[2].trim()) { q.feedback[m[1].toUpperCase()] = verbatim(line).replace(/^[\s\S]*?:\s*/, ''); pending = null; }
        else pending = m[1].toUpperCase();
        mode = 'expl';
        continue;
      }
      if (EXPL_O.test(t)) { mode = 'others'; pending = null; continue; }
      if (mode === 'others' && (m = t.match(EXPL_I))) {
        const letter = m[1].toUpperCase();
        if (q.feedback[letter]) warn.push(`${where}: two explanations for option ${letter}`);
        q.feedback[letter] = verbatim(line).replace(/^\s*[A-D]\s*:\s*/, '');
        pending = letter;
        continue;
      }
      // An option, only before the key.
      if (mode !== 'expl' && mode !== 'others' && !q.correct && (m = t.match(OPTION))) {
        q.options.push({ letter: m[1].toUpperCase(), text: verbatim(line).replace(/^\s*[A-D]\.\s+/, '') });
        mode = 'opts';
        continue;
      }
      if (pending) { q.feedback[pending] = verbatim(line); pending = null; continue; }
      if (mode === 'prompt') { q._prompt.push(verbatim(line)); continue; }
      if (mode === 'expl' || mode === 'others') {
        const open = Object.keys(q.feedback).pop();
        if (open && q.feedback[open]) { q.feedback[open] += '\n' + verbatim(line); continue; }
      }
      warn.push(`${where}: unplaced line "${t.slice(0, 56)}"`);
    }

    // ---- shape ----
    const parts = q._prompt.map(verbatim).filter(Boolean);
    q.prompt = parts.length === 1 ? parts[0] : parts;
    q.hasScenario = /^\s*Scenario\s*:/i.test(parts[0] || '');
    delete q._prompt;

    if (!parts.length) warn.push(`${where}: no prompt`);
    if (q.sourceNum !== q.num) {
      warn.push(`${where}: numbered ${q.sourceNum} in the source but sits at position ${q.num} of its module`);
    }
    const letters = q.options.map(o => o.letter).sort().join('');
    if (letters !== 'ABCD') warn.push(`${where}: options are "${letters}", expected ABCD`);
    if (!q.correct) warn.push(`${where}: no "Correct Answer" line`);
    else if (!q.options.some(o => o.letter === q.correct)) {
      warn.push(`${where}: key is ${q.correct} but there is no option ${q.correct}`);
    }
    // Coursera refuses repeated options with "Duplicate answers are not allowed" and nothing
    // else notices. SETUP section 6, convention 4.
    {
      const seen = new Map();
      for (const o of q.options) {
        const kk = norm(o.text);
        if (seen.has(kk)) warn.push(`${where}: options ${seen.get(kk)} and ${o.letter} are identical`);
        else seen.set(kk, o.letter);
      }
    }
    const missing = q.options.map(o => o.letter).filter(x => !q.feedback[x]);
    if (missing.length) warn.push(`${where}: no explanation for ${missing.join(', ')}`);
    if (q.correctExplFor.length !== 1) {
      warn.push(`${where}: ${q.correctExplFor.length} "(Correct)" explanation labels`);
    } else if (q.correct && q.correctExplFor[0] !== q.correct) {
      throw new Error(`${where}: the answer key disagrees with itself — "Correct Answer: ${q.correct}" `
        + `but the explanation labelled (Correct) is for ${q.correctExplFor[0]}. Resolve it in the `
        + 'source; either reading would star a different option.');
    }

    // ---- the mapping, and the two independent statements of it ----
    if (!q.mapped) warn.push(`${where}: no "Mapped to:" line`);
    else {
      const v = VIDEOS[q.mapped];
      if (!v) warn.push(`${where}: cites ${q.mapped}, which the outline has no video for`);
      else {
        if (v.module !== n) warn.push(`${where}: cites ${q.mapped}, which is outside module ${n}`);
        // "Video: <title>" states the same mapping in words. paid-ads-11 is the case that makes
        // this worth checking: there the code and the title disagreed on 17 of 110 questions.
        if (q.statedVideo && norm(q.statedVideo) !== norm(v.video)) {
          warn.push(`${where}: cites ${q.mapped} — "${v.video}" — but names the video `
            + `"${q.statedVideo}". The code is used; check which is right.`);
        }
        const lmeta = (MMETA['M' + v.module] || { lessons: {} }).lessons[v.lesson] || {};
        if (q.statedLesson && lmeta.title && norm(q.statedLesson) !== norm(lmeta.title)) {
          notes.push(`${where}: names lesson "${q.statedLesson}" where the outline calls `
            + `L${v.lesson} "${lmeta.title}"`);
        }
      }
    }

    mo.questions.push(q);
  });
});

if (process.argv.includes('--report')) {
  for (const mo of modules) {
    const used = new Set(mo.questions.map(x => x.mapped).filter(Boolean));
    const all = Object.keys(VIDEOS).filter(k => VIDEOS[k].module === mo.num);
    const lessons = new Set([...used].map(c => (c.match(/^M\d+(L\d+)/) || [])[1]).filter(Boolean));
    console.log(`Module ${mo.num} — ${mo.title}: ${mo.questions.length} questions, `
      + `${lessons.size} lessons covered, ${used.size} of ${all.length} videos referenced`);
  }
  const all = modules.flatMap(mo => mo.questions);
  const byLetter = {}; for (const x of all) byLetter[x.correct] = (byLetter[x.correct] || 0) + 1;
  const blooms = {}; for (const x of all) if (x.bloom) blooms[x.bloom] = (blooms[x.bloom] || 0) + 1;
  const longest = all.flatMap(x => [...(Array.isArray(x.prompt) ? x.prompt : [x.prompt]),
    ...Object.values(x.feedback)]).reduce((a, s) => Math.max(a, String(s).length), 0);
  console.log(`\n${modules.length} modules · ${all.length} questions · `
    + `${all.reduce((a, x) => a + x.options.length, 0)} options · `
    + `${all.reduce((a, x) => a + Object.keys(x.feedback).length, 0)} explanations · `
    + `${all.filter(x => x.hasScenario).length} scenarios`);
  console.log('answer key spread: ' + Object.entries(byLetter).sort().map(([k, v]) => `${k}:${v}`).join(' '));
  console.log(`video coverage:    ${new Set(all.map(x => x.mapped).filter(Boolean)).size} of `
    + `${Object.keys(VIDEOS).length} videos referenced`);
  console.log('question types:    ' + Object.entries(blooms).sort().map(([k, v]) => `${k}:${v}`).join(' '));
  console.log(`prompt lines:      ${all.filter(x => Array.isArray(x.prompt)).length} questions use more `
    + `than one line, ${all.filter(x => !Array.isArray(x.prompt)).length} are one line`);
  console.log(`longest line:      ${longest} characters`);
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
  if (notes.length) { console.log(`\nnotes: ${notes.length}`); notes.forEach(x => console.log('  ' + x)); }
} else {
  warn.forEach(w => console.error('WARN ' + w));
  notes.forEach(x => console.error('NOTE ' + x));
  console.log(JSON.stringify(modules, null, 2));
}
