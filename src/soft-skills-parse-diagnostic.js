// Parser for the Soft Skills for Work and Life PRE-COURSE DIAGNOSTIC — one quiz, ten questions.
//
// This is the outline's "Interactive Assessment" row, titled "Pre-Course Diagnostic: Soft Skills
// Readiness Self-Assessment", and it is the one assessment in this course that is neither graded
// nor tied to a lesson. Its grammar is its own:
//
//   Q1 — Module 1                                          <- or "Q2 — Module 1 — Scenario-Based"
//   Skill assessed: Recognizing that these behaviors are learned rather than inherited
//   Someone says they were never taught how to handle themselves at work, and that people …
//   A. These are learned behaviors, and deliberate instruction in them usually stops early …
//   B. They are correct, because these behaviors are personality traits rather than skills
//   Correct answer: A                                      <- lower-case "answer", no ✅
//   Explanation for option A. Correct. Children are taught these behaviors daily in early …
//   Explanation for option B. Incorrect. Treating them as fixed traits is the belief this …
//
// Four things separate it from every other quiz in this repository:
//
//   * IT MAPS TO A MODULE, NOT A VIDEO. There is no "Mapped to: M1L1V1" line anywhere, and
//     there should not be — a pre-course diagnostic runs before any video is watched, and its
//     purpose is to route the learner to a module. The builder therefore writes the reference as
//     "Refer to Module N: <module title>" rather than naming a video.
//   * the verdict sits in the explanation LABEL ("… option A. Correct."), which is consumed
//     along with the label, so the stored feedback text arrives clean — as in ai-products.
//   * "Skill assessed:" is guidance for the course team and is explicitly NOT shown to the
//     learner. It is captured for the Guide Section and never reaches the import section.
//   * the document opens with a page of design notes before "Question Bank". Nothing before the
//     first "Q<n> — Module <n>" header is content, so the parse starts there.
//
// The five scenario-based questions write the scenario and the question as two lines separated
// by a <w:br/>; lib-lines splits on it, so both arrive as separate prompt paragraphs and the
// builder keeps the split. No prompt opens with a one-word label, so nothing here meets the
// `word:`-as-answer-option failure the graded quizzes have to avoid.
const fs = require('fs');
const path = require('path');
const { lines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'soft-skills';
const LET = ['A', 'B', 'C', 'D'];

const outlinePath = path.join(SP, SLUG, 'outline.json');
if (!fs.existsSync(outlinePath)) {
  console.error(`ENOENT ${outlinePath}\n`
    + 'The module titles the reference line names come from the outline:\n'
    + `  node src/soft-skills-parse-outline.js > ${outlinePath}`);
  process.exit(1);
}
const { meta: MMETA, course: COURSE } = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));

const text = s => String(s).replace(/ /g, ' ').replace(/^[ \t]+|[ \t]+$/g, '');

const Q_HEAD = /^Q(\d+)\s*[—–-]\s*Module\s+(\d+)\s*(?:[—–-]\s*(.+?))?\s*$/i;
const SKILL  = /^Skill assessed\s*:\s*(.+)$/i;
const OPTION = /^([A-D])\.\s*(.+)$/;
const KEY    = /^\s*(?:✅\s*)?Correct answer\s*:\s*([A-D])\b/i;
const EXPL   = /^Explanation for option\s+([A-D])\.\s*(Correct|Incorrect)\.\s*(.*)$/i;

const warn = [];

const src = path.join(SP, SLUG, 'diagnostic', 'word', 'document.xml');
if (!fs.existsSync(src)) {
  console.error(`ENOENT ${src}\nUnzip the diagnostic document first:\n`
    + `  unzip -q "SoftSkillsDummies_PathwayGate_PreCourseDiagnostic.docx" -d work/${SLUG}/diagnostic`);
  process.exit(1);
}
const L = lines(src).map(text).filter(s => s.trim());

const starts = [];
L.forEach((l, i) => { if (Q_HEAD.test(l)) starts.push(i); });
if (!starts.length) { console.error('no "Q<n> — Module <n>" headers found'); process.exit(1); }

const unit = {
  num: 1,
  title: 'Pre-Course Diagnostic: Soft Skills Self-Assessment',
  questions: [],
};

starts.forEach((start, k) => {
  const end = k + 1 < starts.length ? starts[k + 1] : L.length;
  const blk = L.slice(start, end);
  const head = blk[0].match(Q_HEAD);
  const sourceNum = +head[1];
  const module = +head[2];
  const where = `Q${sourceNum}`;

  const q = {
    num: k + 1, sourceNum, module,
    scenarioBased: /scenario/i.test(head[3] || ''),
    skill: '',
    prompt: [], options: [], correct: null, correctExplFor: null, feedback: {},
  };

  // ---- skill line and prompt --------------------------------------------------------------
  let i = 1;
  for (; i < blk.length && !OPTION.test(blk[i]); i++) {
    const m = blk[i].match(SKILL);
    if (m) { q.skill = m[1].trim(); continue; }   // guidance for the course team, not the learner
    q.prompt.push(blk[i]);
  }
  if (!q.prompt.length) { warn.push(`${where}: no prompt — question skipped`); return; }

  // ---- options, key, explanations ----------------------------------------------------------
  let pendingLetter = null;
  for (; i < blk.length; i++) {
    const l = blk[i];
    let m;

    if (!q.correct && (m = l.match(OPTION)) && LET.includes(m[1])) {
      q.options.push({ letter: m[1], text: m[2] });
      continue;
    }
    if ((m = l.match(KEY))) { q.correct = m[1].toUpperCase(); pendingLetter = null; continue; }
    if ((m = l.match(EXPL))) {
      const letter = m[1].toUpperCase();
      if (/^correct$/i.test(m[2])) {
        if (q.correctExplFor && q.correctExplFor !== letter) {
          warn.push(`${where}: more than one explanation is labelled Correct (${q.correctExplFor}, ${letter})`);
        }
        q.correctExplFor = letter;
      }
      if (m[3] && m[3].trim()) { q.feedback[letter] = m[3].trim(); pendingLetter = null; }
      else pendingLetter = letter;
      continue;
    }
    if (pendingLetter) { q.feedback[pendingLetter] = l; pendingLetter = null; continue; }
    // A continuation line of the explanation most recently opened.
    const open = Object.keys(q.feedback).pop();
    if (open && q.feedback[open]) { q.feedback[open] += '\n' + l; continue; }
    warn.push(`${where}: unmatched line "${l.slice(0, 60)}"`);
  }

  // ---- checks --------------------------------------------------------------------------------
  const letters = q.options.map(o => o.letter).join('');
  if (letters !== 'ABCD') { warn.push(`${where}: options are "${letters}", expected ABCD — skipped`); return; }
  if (!q.correct) { warn.push(`${where}: no "Correct answer:" line — skipped`); return; }
  if (!q.correctExplFor) { warn.push(`${where}: no explanation labelled "Correct." — skipped`); return; }
  // The key is stated twice and neither statement derives from the other, so they are checked
  // against each other. A disagreement would star the wrong option in a document that looks fine.
  if (q.correct !== q.correctExplFor) {
    throw new Error(`${where}: the answer key disagrees with itself — "Correct answer: ${q.correct}" `
      + `but the explanation labelled Correct is for ${q.correctExplFor}. Resolve it in the source.`);
  }
  const missing = LET.filter(x => !q.feedback[x]);
  if (missing.length) { warn.push(`${where}: no explanation for ${missing.join(', ')} — skipped`); return; }
  if (!MMETA['M' + module]) { warn.push(`${where}: Module ${module} is not in the outline — skipped`); return; }
  if (!q.skill) warn.push(`${where}: no "Skill assessed:" line`);
  if (q.sourceNum !== q.num) {
    warn.push(`${where}: numbered ${q.sourceNum} in the source but sits at position ${q.num}`);
  }

  unit.questions.push(q);
});

// --- coverage, against the diagnostic's own stated design ----------------------------------
// "two questions each for Modules 1 and 2 and three questions each for Modules 3 and 4, for a
// total of ten questions. Each module includes at least one scenario-based question."
const PLANNED = { 1: 2, 2: 2, 3: 3, 4: 3 };
const byModule = {};
for (const q of unit.questions) byModule[q.module] = (byModule[q.module] || 0) + 1;
for (const [m, n] of Object.entries(PLANNED)) {
  if ((byModule[m] || 0) !== n) {
    warn.push(`Module ${m}: ${byModule[m] || 0} question(s), but the diagnostic's design note plans ${n}`);
  }
}
for (const m of Object.keys(PLANNED)) {
  if (!unit.questions.some(q => q.module === +m && q.scenarioBased)) {
    warn.push(`Module ${m}: no scenario-based question, which the design note says every module has`);
  }
}
if (unit.questions.length !== 10) {
  warn.push(`${unit.questions.length} questions parsed, but the design note plans ten`);
}

if (process.argv.includes('--report')) {
  const key = {};
  console.log(`${COURSE.title}`);
  console.log(`  ${unit.title}`);
  for (const q of unit.questions) {
    key[q.correct] = (key[q.correct] || 0) + 1;
    console.log(`    Q${q.num}  Module ${q.module}${q.scenarioBased ? '  [scenario]' : '           '}  `
      + `key ${q.correct}  ${q.prompt.length} prompt line(s)  —  ${q.skill.slice(0, 52)}`);
  }
  const longest = unit.questions.flatMap(q => [...q.prompt, ...Object.values(q.feedback)])
    .reduce((a, s) => Math.max(a, s.length), 0);
  console.log(`\n1 diagnostic · ${unit.questions.length} questions · `
    + `${unit.questions.reduce((a, q) => a + q.options.length, 0)} options · `
    + `${unit.questions.reduce((a, q) => a + Object.keys(q.feedback).length, 0)} explanations · `
    + `${unit.questions.filter(q => q.scenarioBased).length} scenario-based`);
  console.log(`module spread:     ${Object.keys(PLANNED).map(m => `M${m}:${byModule[m] || 0}`).join(' ')}`);
  console.log(`answer key spread: ${LET.map(l => `${l}:${key[l] || 0}`).join(' ')}`);
  console.log(`longest line:      ${longest} characters`);
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify([unit], null, 2));
}
