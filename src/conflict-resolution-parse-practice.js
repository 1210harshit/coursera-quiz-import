// Parser for the Resolving Workplace Conflict PRACTICE quizzes — one per lesson, eight in all.
//
// This source uses a THIRD layout, and it is the reason this file differs most from its
// siblings. One document holds all sixteen questions, grouped by MODULE:
//
//   Module 1 – Understanding Conflict in the Workplace     <- four headings, one per module
//   Q1. Scenario:
//   Two of your people are arguing about where a shelf of vendor binders should live …
//   A. A durable outcome, since the dispute is genuinely about storage and nothing more
//   ✅ Correct Answer: B                                    <- B, C, D likewise
//   Mapped to: M1L1V1
//   Explanation for Option B (Correct):
//   One of them values respect and his workspace keeps being encroached on …
//   Explanation for Other Options:
//   A: The binders were never about binders, which is the point the example is used to make.
//
// NO LESSON HEADING EXISTS ANYWHERE, yet the unit of output is still the lesson: the outline
// plans one practice quiz per lesson, eight in all, and the workbook carries eight lesson-level
// Practice Assignment rows. The lesson is recovered from each question own "Mapped to: MxLyVz"
// code, where y IS the lesson — so questions are routed by their own mapping rather than by
// position, and the split is derived rather than assumed. See the section splitter below.
//
// The other two layouts are still accepted, because these courses share a generator and a later
// revision is free to switch: "Module N, Lesson N – Title" on one line, or "Module N: Title"
// followed by "Lesson N: Title".
//
// Question numbers restart at 1 within each module here, where other courses run 1-16 across the
// document. Both are accepted; a number matching neither scheme is what gets reported.
//
// Each lesson holds two questions, and the sixteen between them reference all sixteen of the
// course videos exactly once. Both facts are checked rather than assumed.
const fs = require('fs');
const path = require('path');
const { lines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'conflict-resolution';
const LET = ['A', 'B', 'C', 'D'];

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n`
    + 'The module and lesson titles and the mapping cross-check all come from the outline:\n'
    + `  node src/conflict-resolution-parse-outline.js > ${outlinePath}`);
  process.exit(1);
}
const { map: VIDEOS, meta: MMETA, cumulativeAlias: ALIAS = {} } =
  JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

// Same V-numbering difference the graded quizzes have: this document counts V across the MODULE
// (M1L2V3) where the outline restarts it each lesson (M1L2V1). The translation is derived once
// in outline.json as `cumulativeAlias` so the two parsers cannot drift. Applied only when the
// cited code resolves to nothing, and always reported.
function resolveMapped(code, where) {
  if (!code || VIDEOS[code]) return code;
  const alias = ALIAS[code];
  if (!alias) return code;
  warn.push(`${where}: cites ${code}, which the outline has no video for. The quiz counts V across `
    + `the module and the outline restarts it each lesson, so this resolves to ${alias} — `
    + `"${VIDEOS[alias].video}"`);
  return alias;
}

const text = s => String(s).replace(/ /g, ' ').replace(/^[ \t]+|[ \t]+$/g, '');

// The two heading layouts this template produces — see the section splitter below for why both
// are supported. The separator class is wide on all three because the courses built to this
// template use a colon, a hyphen and an en dash interchangeably.
//
//   COMBINED  "Module 1, Lesson 1 – Title"   emotional-intelligence, critical-thinking
//   MODULE    "Module 1: Title"              soft-skills, conflict-resolution
//   LESSON    "Lesson 1: Title"
//
// COMBINED is tested FIRST everywhere it is used: "Module 1, Lesson 1 – Title" would otherwise
// also satisfy MODULE, which would take "1" as the module and ", Lesson 1 – Title" as its title.
const COMBINED = /^Module\s+(\d+)\s*,\s*Lesson\s+(\d+)\s*[-–—:]\s*(.+)$/i;
const MODULE   = /^Module\s+(\d+)\s*[-–—:]\s*(.+)$/i;
const LESSON   = /^Lesson\s+(\d+)\s*[-–—:]\s*(.+)$/i;
const Q_HEAD  = /^Q(\d+)\.\s*(.*)$/;
const SCENARIO = /^Scenario\s*:\s*$/i;
const OPTION  = /^([A-D])\.\s*(.+)$/;
const KEY     = /^\s*(?:✅\s*)?Correct Answer\s*:\s*([A-D])\b/i;
const MAPPED  = /^Mapped to\s*:\s*(M\d+L\d+V\d+)\b/i;
// EVERY option is labelled in full here — "Explanation for Option A:" — where the graded quizzes
// of this same course write "Explanation for Other Options:" once and then bare "A:" lines. So
// the letter always arrives on its own label and there is no shared header to switch mode on.
// The "(Correct)" marker is optional and is what identifies the key's second witness.
const EXPL_ANY = /^Explanation for Option\s+([A-D])\s*(?:\((Correct|Incorrect)\))?\s*:\s*(.*)$/i;
// Kept for the graded-style layout, in case a later revision of this document adopts it.
const EXPL_O  = /^Explanation for Other Options\s*:\s*$/i;
const EXPL_I  = /^([A-D])\s*:\s*(.+)$/;

const warn = [];
const units = [];

const src = path.join(SP, SLUG, 'practice', 'word', 'document.xml');
if (!fs.existsSync(src)) {
  console.error(`ENOENT ${src}\nUnzip the practice quiz document first:\n`
    + `  unzip -q "Resolving Workplace Conflict from Mediation to Agreement - Practice Quiz.docx" -d work/${SLUG}/practice`);
  process.exit(1);
}
const L = lines(src).map(text).filter(s => s.trim());

// --- split into lesson sections -------------------------------------------------------------
// BOTH Dummies layouts are accepted, because the four courses built to this template use two:
//
//   combined   "Module 1, Lesson 1 – Title"        one line, lesson title only
//   split      "Module 1: Title"                   two lines, module title stated too
//              "Lesson 1: Title"
//
// emotional-intelligence and critical-thinking write the first, soft-skills and this course the
// second. Supporting both costs one extra branch and removes the need to fork this file again.
//
// A lesson's body ends at the NEXT HEADING OF EITHER KIND, not at the next lesson heading. In the
// split layout the module heading that opens each new module sits between the previous lesson's
// last question and that module's first lesson heading; bounding on lesson headings alone would
// sweep it into the preceding explanation, where it arrives as a line break inside a Feedback:
// paragraph and the verifier rejects it.
const headings = [];
L.forEach((l, i) => { if (COMBINED.test(l) || MODULE.test(l) || LESSON.test(l)) headings.push(i); });

const sections = [];
let curMod = null, curModTitle = '';
L.forEach((l, i) => {
  let m;
  if ((m = l.match(COMBINED))) {
    // The combined form states no module title; the outline is the only authority for it.
    sections.push({ module: +m[1], moduleSourceTitle: '', lesson: +m[2], lessonSourceTitle: m[3].trim(), at: i });
    curMod = +m[1]; curModTitle = '';
    return;
  }
  if ((m = l.match(MODULE))) { curMod = +m[1]; curModTitle = m[2].trim(); return; }
  if ((m = l.match(LESSON)) && curMod) {
    sections.push({ module: curMod, moduleSourceTitle: curModTitle, lesson: +m[1], lessonSourceTitle: m[2].trim(), at: i });
  }
});
// THIRD LAYOUT: grouped by MODULE only, with no lesson heading anywhere. This source writes four
// "Module N – Title" headings for its sixteen questions and nothing finer, yet the unit of output
// is still the lesson — the outline plans one practice quiz per lesson, eight in all, and the
// workbook carries eight lesson-level Practice Assignment rows.
//
// The lesson is recoverable without guessing: every question states its own "Mapped to: MxLyVz",
// and y IS the lesson. So each module heading is split into one section per lesson it actually
// contains, in the order the lessons first appear, and the questions are routed by their own
// mapping rather than by position. A question whose mapping is missing or unreadable cannot be
// placed and is reported rather than dropped into whichever lesson came last.
if (!sections.some(s => s.lesson)) {
  const modHeads = [];
  L.forEach((l, i) => { const m = l.match(MODULE); if (m) modHeads.push({ module: +m[1], title: m[2].trim(), at: i }); });
  if (modHeads.length) {
    warn.push(`the practice document is grouped by MODULE only (${modHeads.length} headings, no lesson `
      + 'headings). Each question has been routed to its lesson using its own "Mapped to:" code.');
    sections.length = 0;
    modHeads.forEach((mh, k) => {
      const end = k + 1 < modHeads.length ? modHeads[k + 1].at : L.length;
      // Which lessons does this module's block actually contain, and where does each start?
      const seen = new Map();
      for (let i = mh.at + 1; i < end; i++) {
        const mm = L[i].match(/^Mapped to\s*:\s*M(\d+)L(\d+)V\d+/i);
        if (!mm || +mm[1] !== mh.module) continue;
        const les = +mm[2];
        if (!seen.has(les)) {
          // The section must start at the question header this mapping belongs to, not at the
          // mapping line, so walk back to the nearest "Q<n>." above it.
          let qAt = i;
          while (qAt > mh.at && !Q_HEAD.test(L[qAt])) qAt--;
          seen.set(les, qAt - 1);
        }
      }
      [...seen.entries()].sort((a, b) => a[0] - b[0]).forEach(([les, at]) => {
        sections.push({ module: mh.module, moduleSourceTitle: mh.title, lesson: les, lessonSourceTitle: '', at });
      });
    });
    sections.sort((a, b) => a.at - b.at);
    // These sections have no heading line of their own: `at` is one line ABOVE the first question
    // header, so that the reader's slice(at + 1, end) starts exactly at that header. The bound
    // cannot come from `headings` here — a synthetic section's own start would terminate it — so
    // each carries an explicit `end`, which is the next section's first question header.
    sections.forEach((s, k) => {
      s.end = k + 1 < sections.length ? sections[k + 1].at + 1 : L.length;
      // …but never past a MODULE heading. The heading that opens the next module sits between the
      // previous lesson's last explanation and the next lesson's first question, so bounding only
      // on the next question header sweeps it into that explanation — where it arrives as a line
      // break inside a Feedback: paragraph and the verifier rejects the document. This bit the
      // last lesson of modules 1, 2 and 3 before the clamp was added.
      const h = modHeads.find(mh => mh.at > s.at && mh.at < s.end);
      if (h) s.end = h.at;
    });
  }
}
if (!sections.length) {
  console.error('no lesson headings found — expected "Module N, Lesson N: Title" on one line, '
    + '"Module N: Title" followed by "Lesson N: Title", or module-only headings whose questions '
    + 'carry "Mapped to: MxLyVz" codes');
  process.exit(1);
}

let running = 0;
const perModule = {};
let numberedPerModule = false;
sections.forEach((sec) => {
  const next = headings.filter(i => i > sec.at);
  const end = sec.end !== undefined ? sec.end : (next.length ? next[0] : L.length);
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
    let mode = null, pendingLetter = null, lastExplLetter = null;
    for (; i < blk.length; i++) {
      const l = blk[i];
      let m;

      if (!q.correct && (m = l.match(OPTION)) && LET.includes(m[1])) {
        q.options.push({ letter: m[1], text: m[2] });
        continue;
      }
      if ((m = l.match(KEY)))    { q.correct = m[1].toUpperCase(); mode = null; continue; }
      if ((m = l.match(MAPPED))) { q.mapped = m[1].toUpperCase();  mode = null; continue; }
      // One labelled block per option. The label may carry its text on the same line or leave it
      // to the next, so the letter is held in pendingLetter either way — the same mechanism the
      // graded parser uses for its "(Correct)" block.
      if ((m = l.match(EXPL_ANY))) {
        const L = m[1].toUpperCase();
        if (m[2] && /^correct$/i.test(m[2])) q.correctExplFor = q.correctExplFor || L;
        pendingLetter = L;
        if (m[3] && m[3].trim()) { q.feedback[L] = m[3].trim(); pendingLetter = null; }
        mode = 'expl';
        lastExplLetter = L;
        continue;
      }
      if (EXPL_O.test(l)) { mode = 'other'; pendingLetter = null; continue; }
      if (mode === 'other' && (m = l.match(EXPL_I))) { q.feedback[m[1].toUpperCase()] = m[2]; lastExplLetter = m[1].toUpperCase(); continue; }
      if (pendingLetter) { q.feedback[pendingLetter] = l; pendingLetter = null; continue; }
      // A continuation of whichever explanation is open. With one labelled block per option,
      // that is simply the last letter seen — no need to infer it from which keys exist.
      if (mode && lastExplLetter && q.feedback[lastExplLetter]) {
        q.feedback[lastExplLetter] += '\n' + l;
        continue;
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
    q.mapped = resolveMapped(q.mapped, where);
    if (!VIDEOS[q.mapped]) { warn.push(`${where}: mapping ${q.mapped} is not in the outline — skipped`); return; }
    // A practice quiz belongs to its lesson, so its questions must point inside that lesson.
    const v = VIDEOS[q.mapped];
    if (v.module !== sec.module || v.lesson !== sec.lesson) {
      warn.push(`${where}: mapping ${q.mapped} points at M${v.module}L${v.lesson}, outside this lesson — `
        + 'a practice quiz question that reviews another lesson is a content decision, not a mapping to repair');
    }
    // Two numbering conventions exist across these courses: 1-16 across the whole document, and
    // 1-N restarting at each module. Both are fine — what matters is that a question's number
    // agrees with SOME consistent scheme, because a number that agrees with neither means one was
    // moved without renumbering. The per-module position is tracked alongside the document one and
    // the mismatch is only reported when the number matches neither.
    perModule[sec.module] = (perModule[sec.module] || 0) + 1;
    if (q.sourceNum !== running && q.sourceNum !== perModule[sec.module]) {
      warn.push(`${where}: numbered ${q.sourceNum} in the source, but it sits at document position `
        + `${running} and at position ${perModule[sec.module]} within module ${sec.module} — it `
        + 'matches neither, so a question was moved or inserted without renumbering');
    } else if (q.sourceNum !== running) {
      numberedPerModule = true;
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

if (numberedPerModule) {
  warn.push('the source numbers questions 1-N within each MODULE rather than 1-16 across the '
    + 'document. Both conventions appear across these courses; it is noted once here so the '
    + 'per-question position check does not report every question.');
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
