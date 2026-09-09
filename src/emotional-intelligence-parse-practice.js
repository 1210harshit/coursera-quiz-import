// Parser for the Emotional Intelligence for Work and Life PRACTICE quizzes — one per lesson, eight in all.
//
// One document holds all eight lessons, split by a single COMBINED "Module N, Lesson N: Title"
// heading. Within a lesson the grammar is identical to the graded quizzes this course already
// ships (emotional-intelligence-parse-quiz.js), so the two parsers agree line for line on
// everything except the lesson split and the question renumbering:
//
//   Module 1, Lesson 1: Feeling Smart and Assessing Your Emotional Intelligence
//   Q1. Every interaction at home is described as either a deposit or a withdrawal. What does …
//   A. Positive exchanges build trust and affection, and negative ones weaken the same bonds.
//   ✅ Correct Answer: A                                                    <- B, C, D likewise
//   Mapped to: M1L1V1
//   Explanation for Option A (Correct):
//   Treat every interaction as a deposit or a withdrawal. Positive exchanges build trust …
//   Explanation for Other Options:
//   B: No ledger is being kept by anybody. The comparison describes the cumulative effect …
//
// THE HEADING IS ONE LINE, NOT TWO. soft-skills, the course this parser was adapted from, writes
// "Module N – Title" and "Lesson N: Title" as separate paragraphs, and neither of its regexes
// matches anything here — a comma is not in its module separator class, and its lesson pattern
// has to start the line. Both numbers and the LESSON title arrive together, and no module title
// is stated anywhere in the document. Two consequences follow:
//
//   * the module title comes from the outline alone. There is no source title to disagree with
//     it, so the "heading says X but the outline says Y" check applies to lesson titles only.
//   * a lesson body ends at the next combined heading. In soft-skills a module heading sat
//     between one lesson's last question and the next lesson's heading, and bounding on lesson
//     headings alone swept it into the preceding explanation, arriving as a line break inside a
//     Feedback: paragraph that the verifier rejects. With one heading kind there is no such
//     intervening line, so the bound is simply the next heading.
//
// Question numbers run 1-16 across the whole document and are renumbered 1-2 within each
// lesson, as ai-products does across modules. The source number is kept and checked against the
// position, so a question moved between lessons without renumbering is reported.
//
// The unit of output is the LESSON, not the module: Coursera holds one practice quiz per lesson,
// so this emits eight units and the builder writes eight documents. Every other quiz parser in
// this repository emits one unit per module, which is why the shape carries both numbers.
//
// Each lesson holds two questions, and the sixteen between them reference all sixteen of the
// course's videos exactly once. Both facts are checked rather than assumed — a lesson whose two
// questions point at the same video, or at a video in another lesson, is reported.
const fs = require('fs');
const path = require('path');
const { lines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'emotional-intelligence';
const LET = ['A', 'B', 'C', 'D'];

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n`
    + 'The module and lesson titles and the mapping cross-check all come from the outline:\n'
    + `  node src/emotional-intelligence-parse-outline.js > ${outlinePath}`);
  process.exit(1);
}
const { map: VIDEOS, meta: MMETA } = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

const text = s => String(s).replace(/ /g, ' ').replace(/^[ \t]+|[ \t]+$/g, '');

const COMBINED = /^Module\s+(\d+)\s*,\s*Lesson\s+(\d+)\s*:\s*(.+)$/i;
const Q_HEAD  = /^Q(\d+)\.\s*(.*)$/;
const SCENARIO = /^Scenario\s*:\s*$/i;
const OPTION  = /^([A-D])\.\s*(.+)$/;
const KEY     = /^\s*(?:✅\s*)?Correct Answer\s*:\s*([A-D])\b/i;
const MAPPED  = /^Mapped to\s*:\s*(M\d+L\d+V\d+)\b/i;
const EXPL_C  = /^Explanation for Option\s+([A-D])\s*\(Correct\)\s*:\s*(.*)$/i;
const EXPL_O  = /^Explanation for Other Options\s*:\s*$/i;
const EXPL_I  = /^([A-D])\s*:\s*(.+)$/;

const warn = [];
const units = [];

const src = path.join(SP, SLUG, 'practice', 'word', 'document.xml');
if (!fs.existsSync(src)) {
  console.error(`ENOENT ${src}\nUnzip the practice quiz document first:\n`
    + `  unzip -q "EmotionalIntelligence_PracticeQuiz.docx" -d work/${SLUG}/practice`);
  process.exit(1);
}
const L = lines(src).map(text).filter(s => s.trim());

// --- split into lesson sections -------------------------------------------------------------
// One heading kind, so a lesson's body simply runs to the next heading. moduleSourceTitle stays
// empty because the document states no module title — see the header comment.
const headings = [];
L.forEach((l, i) => { if (COMBINED.test(l)) headings.push(i); });

const sections = [];
L.forEach((l, i) => {
  const m = l.match(COMBINED);
  if (m) {
    sections.push({ module: +m[1], moduleSourceTitle: '', lesson: +m[2], lessonSourceTitle: m[3].trim(), at: i });
  }
});
if (!sections.length) { console.error('no "Module N, Lesson N: Title" headings found'); process.exit(1); }

let running = 0;
sections.forEach((sec) => {
  const next = headings.filter(i => i > sec.at);
  const end = next.length ? next[0] : L.length;
  const body = L.slice(sec.at + 1, end);

  const mmeta = MMETA['M' + sec.module] || { title: '', lessons: {} };
  const lmeta = (mmeta.lessons || {})[sec.lesson] || { title: '' };
  // The outline is the authority for the titles that reach the built document.
  if (mmeta.title && sec.moduleSourceTitle && mmeta.title !== sec.moduleSourceTitle) {
    warn.push(`M${sec.module}: practice quiz heading says "${sec.moduleSourceTitle}" but the outline `
      + `says "${mmeta.title}" — the outline title is used`);
  }
  if (lmeta.title && sec.lessonSourceTitle && lmeta.title !== sec.lessonSourceTitle) {
    warn.push(`M${sec.module}L${sec.lesson}: practice quiz heading says "${sec.lessonSourceTitle}" but `
      + `the outline says "${lmeta.title}" — the outline title is used`);
  }

  const unit = {
    num: sec.module,
    lesson: sec.lesson,
    title: mmeta.title || sec.moduleSourceTitle,
    lessonTitle: lmeta.title || sec.lessonSourceTitle,
    questions: [],
  };
  units.push(unit);

  const starts = [];
  body.forEach((l, i) => { if (Q_HEAD.test(l)) starts.push(i); });
  if (!starts.length) { warn.push(`M${sec.module}L${sec.lesson}: no "Q<n>." headers found`); return; }

  starts.forEach((start, k) => {
    const stop = k + 1 < starts.length ? starts[k + 1] : body.length;
    const blk = body.slice(start, stop);
    const head = blk[0].match(Q_HEAD);
    const sourceNum = +head[1];
    const where = `M${sec.module}L${sec.lesson} Q${sourceNum}`;
    running++;

    const q = {
      num: k + 1, sourceNum,
      prompt: [], options: [], correct: null, correctExplFor: null,
      feedback: {}, mapped: '', hasScenario: false,
    };

    // ---- prompt --------------------------------------------------------------------------
    let i = 1;
    if (SCENARIO.test(head[2]) || !head[2]) {
      q.hasScenario = true;
      if (!SCENARIO.test(head[2])) warn.push(`${where}: header carries no question text`);
    } else {
      q.prompt.push(head[2]);
    }
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
    // Two independent statements of the key; a disagreement would star the wrong option.
    if (q.correct !== q.correctExplFor) {
      throw new Error(`${where}: the answer key disagrees with itself — "Correct Answer: ${q.correct}" `
        + `but the explanation labelled (Correct) is for ${q.correctExplFor}. Resolve it in the source.`);
    }
    const missing = LET.filter(x => !q.feedback[x]);
    if (missing.length) { warn.push(`${where}: no explanation for ${missing.join(', ')} — skipped`); return; }
    if (!q.mapped) { warn.push(`${where}: no "Mapped to:" line — skipped`); return; }
    if (!VIDEOS[q.mapped]) { warn.push(`${where}: mapping ${q.mapped} is not in the outline — skipped`); return; }
    // A practice quiz belongs to its lesson, so its questions must point inside that lesson.
    const v = VIDEOS[q.mapped];
    if (v.module !== sec.module || v.lesson !== sec.lesson) {
      warn.push(`${where}: mapping ${q.mapped} points at M${v.module}L${v.lesson}, outside this lesson — `
        + 'a practice quiz question that reviews another lesson is a content decision, not a mapping to repair');
    }
    if (q.sourceNum !== running) {
      warn.push(`${where}: numbered ${q.sourceNum} in the source but sits at document position ${running}`);
    }

    unit.questions.push(q);
  });
});

// --- coverage -------------------------------------------------------------------------------
const used = new Map();
for (const u of units) for (const q of u.questions) used.set(q.mapped, (used.get(q.mapped) || 0) + 1);
const allVideos = Object.keys(VIDEOS);
const unused = allVideos.filter(k => !used.has(k));
const doubled = [...used.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k}×${n}`);
if (unused.length) warn.push(`no practice question references ${unused.join(', ')}`);
if (doubled.length) warn.push(`referenced more than once: ${doubled.join(', ')}`);
for (const u of units) {
  if (u.questions.length !== 2) {
    warn.push(`M${u.num}L${u.lesson}: ${u.questions.length} question(s) — the outline plans two per lesson`);
  }
}

if (process.argv.includes('--report')) {
  let total = 0;
  const key = {};
  for (const u of units) {
    console.log(`Module ${u.num} Lesson ${u.lesson} — ${u.lessonTitle}: ${u.questions.length} questions `
      + `(${u.questions.map(q => q.mapped).join(', ')})`);
    total += u.questions.length;
    for (const q of u.questions) key[q.correct] = (key[q.correct] || 0) + 1;
  }
  const all = units.flatMap(u => u.questions);
  const longest = all.flatMap(q => [...q.prompt, ...Object.values(q.feedback)])
    .reduce((a, s) => Math.max(a, s.length), 0);
  console.log(`\n${units.length} practice quizzes · ${total} questions · `
    + `${all.reduce((a, q) => a + q.options.length, 0)} options · `
    + `${all.reduce((a, q) => a + Object.keys(q.feedback).length, 0)} explanations`);
  console.log(`answer key spread: ${LET.map(l => `${l}:${key[l] || 0}`).join(' ')}`);
  console.log(`video coverage:    ${used.size} of ${allVideos.length} videos referenced`);
  console.log(`longest line:      ${longest} characters`);
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify(units, null, 2));
}
