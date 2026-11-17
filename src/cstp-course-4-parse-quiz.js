// Parser for the CSTP Course 3 graded assessment (Executive Communication and Strategic
// Presence). One document holds all three modules, split by "Module N: Title" headings.
//
//   Module 1: Executive-Level Briefing Mastery
//   Question 1
//   Mapped to: M1L1V1   |   Bloom's Level: Remember
//   Which four dimensions make up the executive decision filter?
//   A. Accuracy, latency, throughput, and overall integration complexity.
//   B. Risk, cost, speed of value, and competitive market positioning.      <- C, D likewise
//   ✅ Correct Answer: B
//   Feedback                                                               <- a BARE heading
//   A (Incorrect) These are engineering performance measures. …
//   B (Correct) Risk is framed as business exposure, cost includes …       <- C, D likewise
//
// Three things are its own:
//
//   * the feedback block opens with a bare "Feedback" line carrying no colon and no letter.
//     The lines beneath it begin "A (Incorrect) " — a letter, a bracketed verdict, and then
//     the text, with NO colon anywhere. Read without the heading to switch modes, "A (…)"
//     would have to be told apart from the option "A." on punctuation alone.
//   * the verdict sits in that label, so the set of four states the key a SECOND time. It is
//     checked against the "Correct Answer" line rather than trusted — the only independent
//     witness this source offers.
//   * the mapping line carries a Bloom's level after a pipe. The level is captured for the
//     Guide Section and never reaches the import.
//
// Eight of the thirty questions open "Scenario: " and run to two lines, the scenario and the
// question it asks. Both are hazards this repository has paid for — a prompt line beginning
// `word:` is read by the importer as an answer option, and a second prompt paragraph failed a
// whole document on Growing and Transforming Your Business. The parser records the source as
// written; cstp-course-4-build.js folds the label to "Scenario — " and is run with
// --join-prompt. See the note there.
//
// Content passes through with only leading and trailing whitespace removed.
const fs = require('fs');
const path = require('path');
const { lines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'cstp-course-4';
const LET = ['A', 'B', 'C', 'D'];

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n`
    + 'The module titles and every reference come from the outline:\n'
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

const MODULE  = /^Module\s+(\d+)\s*[:.\-–—]\s*(.+)$/i;
const Q_HEAD  = /^Question\s+(\d+)\s*$/i;
const MAPPED  = /^Mapped to\s*:\s*(M\d+L\d+V\d+)\b\s*(?:\|\s*Bloom'?s(?:\s+Level)?\s*:\s*(.+?))?\s*$/i;
const OPTION  = /^([A-D])\.\s+(.+)$/;
const KEY     = /^[^A-Za-z]*Correct Answer\s*:\s*\(?([A-D])\)?\b/i;
const FB_HEAD = /^Feedback\s*:?\s*$/i;
// "A. text", IDENTICAL IN FORM TO AN OPTION. Only position tells them apart, so this is only
// ever tried after the Feedback heading. Course 3 wrote "A (Incorrect) text" and could be told
// apart on punctuation alone; this one cannot.
const FB_LINE = /^([A-D])\.\s+(.+)$/;
// The key's feedback opens "Correct." and the other three open with nothing. That makes the
// set of four a second statement of the key, checked against the "Correct Answer" line. The
// marker is consumed here rather than left in the text: Coursera already shows the learner
// whether their option was right, so it would only repeat the interface.
const FB_VERDICT = /^(Correct|Incorrect)\s*[.:,!]\s*/i;
// Banner lines above the first question, carrying no content.
const BANNER = /^(?:Graded Assessment|Course Name\s*:|Module Name and Number\s*:|Volume\s*:)/i;

const warn = [];
// Authoring notes found inside a feedback block and dropped. Listed, never silently lost.
const notes = [];
const modules = [];

const L = lines(DOCS[0]).map(verbatim).filter(s => s.trim());

const modStarts = [];
L.forEach((l, i) => { if (MODULE.test(clean(l))) modStarts.push(i); });
if (!modStarts.length) { console.error('no "Module N:" heading anywhere in the document'); process.exit(1); }

modStarts.forEach((mStart, mi) => {
  const mEnd = mi + 1 < modStarts.length ? modStarts[mi + 1] : L.length;
  const mh = clean(L[mStart]).match(MODULE);
  const n = +mh[1];
  const sourceTitle = mh[2].trim();
  const outlineTitle = (MMETA['M' + n] || {}).title || '';
  // The outline is the authority for the title that reaches the built document.
  if (outlineTitle && sourceTitle && clean(outlineTitle) !== clean(sourceTitle)) {
    warn.push(`M${n}: the assessment heading says "${sourceTitle}" but the outline says `
      + `"${outlineTitle}" — the outline title is used`);
  }
  const mo = { num: n, title: outlineTitle || sourceTitle, questions: [] };
  modules.push(mo);

  const body = L.slice(mStart + 1, mEnd);
  const starts = [];
  body.forEach((l, i) => { if (Q_HEAD.test(clean(l))) starts.push(i); });
  if (!starts.length) { warn.push(`M${n}: no "Question <n>" header found`); return; }

  starts.forEach((start, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : body.length;
    const blk = body.slice(start, end);
    const sourceNum = +clean(blk[0]).match(Q_HEAD)[1];
    const where = `M${n} Q${sourceNum}`;

    const q = {
      num: k + 1, sourceNum,
      prompt: '', _prompt: [],
      options: [], correct: null, correctExplFor: [], feedback: {},
      mapped: '', mappedAll: [], bloom: '', hasScenario: false,
    };

    let mode = 'head';
    for (let i = 1; i < blk.length; i++) {
      const line = blk[i];
      const t = clean(line);
      let m;

      if (BANNER.test(t)) continue;          // banner lines above the first question
      if ((m = t.match(MAPPED))) {
        q.mapped = m[1].toUpperCase();
        q.mappedAll = [q.mapped];
        if (m[2]) q.bloom = m[2].trim();
        mode = 'prompt';
        continue;
      }
      if ((m = t.match(KEY))) { q.correct = m[1].toUpperCase(); mode = 'key'; continue; }
      if (FB_HEAD.test(t)) { mode = 'feedback'; continue; }

      // The feedback lines. ONLY read in feedback mode: "A. text" is an option before the key
      // and an explanation after the Feedback heading, and nothing but position separates them.
      if (mode === 'feedback' && (m = t.match(FB_LINE))) {
        const letter = m[1].toUpperCase();
        if (q.feedback[letter]) warn.push(`${where}: two feedback lines for option ${letter}`);
        let text = verbatim(line).replace(/^\s*[A-D]\.\s+/, '');
        const vm = text.match(FB_VERDICT);
        if (vm) {
          if (/^correct$/i.test(vm[1])) q.correctExplFor.push(letter);
          text = text.replace(FB_VERDICT, '');
          if (!text.trim()) { warn.push(`${where}: feedback for ${letter} is only the verdict`); }
        }
        q.feedback[letter] = text;
        continue;
      }

      // An option, only before the key.
      if (mode !== 'feedback' && !q.correct && (m = t.match(OPTION))) {
        q.options.push({ letter: m[1].toUpperCase(), text: verbatim(line).replace(/^\s*[A-D]\.\s+/, '') });
        mode = 'opts';
        continue;
      }

      if (mode === 'prompt') { q._prompt.push(verbatim(line)); continue; }

      // AN UNLABELLED LINE INSIDE A FEEDBACK BLOCK IS NOT FEEDBACK.
      //
      // Every feedback entry in this document opens with its own "A (Correct) " label — 120
      // labels for 120 entries, none of them continued onto a second line. What does appear
      // after the last label is an authoring note to the course team:
      //
      //   Written from the outline high-level description for this demo video, as the demo
      //   script was not supplied.
      //
      // Six questions carry one. Treating it as a continuation put it in the learner's
      // feedback and failed the verifier as a line break inside a paragraph, which is the only
      // reason it was caught; a shorter note would have imported silently. It is reported so
      // the course team can see what was dropped, and dropped.
      if (mode === 'feedback') {
        notes.push(`${where}: "${t.slice(0, 72)}"`);
        continue;
      }
      warn.push(`${where}: unplaced line "${t.slice(0, 56)}"`);
    }

    // ---- shape ----
    const parts = q._prompt.map(verbatim).filter(Boolean);
    q.prompt = parts.length === 1 ? parts[0] : parts;
    q.hasScenario = /^\s*Scenario\s*:/i.test(parts[0] || '');
    delete q._prompt;

    if (!parts.length) warn.push(`${where}: no prompt`);
    if (q.sourceNum !== q.num + mi * 10 && q.sourceNum !== q.num) {
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
        const kk = clean(o.text).toLowerCase();
        if (seen.has(kk)) warn.push(`${where}: options ${seen.get(kk)} and ${o.letter} are identical`);
        else seen.set(kk, o.letter);
      }
    }
    const missing = q.options.map(o => o.letter).filter(x => !q.feedback[x]);
    if (missing.length) warn.push(`${where}: no feedback for ${missing.join(', ')}`);
    // The bracketed verdicts state the key a second time; neither derives from the other.
    if (q.correctExplFor.length !== 1) {
      warn.push(`${where}: ${q.correctExplFor.length} feedback lines are marked (Correct) `
        + `(${q.correctExplFor.join(', ') || 'none'})`);
    } else if (q.correct && q.correctExplFor[0] !== q.correct) {
      throw new Error(`${where}: the answer key disagrees with itself — "Correct Answer: ${q.correct}" `
        + `but the feedback marked (Correct) is on ${q.correctExplFor[0]}. Resolve it in the source; `
        + 'either reading would star a different option.');
    }
    if (!q.mapped) warn.push(`${where}: no "Mapped to:" line`);
    else if (!VIDEOS[q.mapped]) warn.push(`${where}: cites ${q.mapped}, which the outline has no video for`);
    else if (VIDEOS[q.mapped].module !== n) {
      warn.push(`${where}: cites ${q.mapped}, which is outside module ${n}`);
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
  const byLetter = {};
  for (const x of all) byLetter[x.correct] = (byLetter[x.correct] || 0) + 1;
  const blooms = {};
  for (const x of all) if (x.bloom) blooms[x.bloom] = (blooms[x.bloom] || 0) + 1;
  const longest = all.flatMap(x => [...(Array.isArray(x.prompt) ? x.prompt : [x.prompt]),
    ...Object.values(x.feedback)]).reduce((a, s) => Math.max(a, String(s).length), 0);
  console.log(`\n${modules.length} modules · ${all.length} questions · `
    + `${all.reduce((a, x) => a + x.options.length, 0)} options · `
    + `${all.reduce((a, x) => a + Object.keys(x.feedback).length, 0)} feedback lines · `
    + `${all.filter(x => x.hasScenario).length} scenarios`);
  console.log('answer key spread: '
    + Object.entries(byLetter).sort().map(([k, v]) => `${k}:${v}`).join(' '));
  console.log(`video coverage:    ${new Set(all.map(x => x.mapped).filter(Boolean)).size} of `
    + `${Object.keys(VIDEOS).length} videos referenced`);
  console.log("Bloom's levels:    " + Object.entries(blooms).sort().map(([k, v]) => `${k}:${v}`).join(' '));
  console.log(`prompt lines:      ${all.filter(x => Array.isArray(x.prompt)).length} questions use more `
    + `than one line, ${all.filter(x => !Array.isArray(x.prompt)).length} are one line`);
  console.log(`longest line:      ${longest} characters`);
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
  if (notes.length) {
    console.log(`\nauthoring notes dropped from feedback: ${notes.length}`);
    notes.forEach(x => console.log('  ' + x));
  }
} else {
  warn.forEach(w => console.error('WARN ' + w));
  notes.forEach(x => console.error('NOTE dropped authoring note ' + x));
  console.log(JSON.stringify(modules, null, 2));
}
