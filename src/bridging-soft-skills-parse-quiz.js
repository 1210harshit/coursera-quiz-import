// Bridging the Soft Skills Gap — assessment .docx files -> quiz.json
//
// Eight source files, one grammar. Four graded quizzes (ten questions each, module-scoped) and
// four practice files, each holding TWO lesson-scoped practice quizzes of two questions. The
// outline budgets one practice quiz per lesson, eight in all, so the practice files are split
// at their lesson headings and emitted as eight separate quizzes rather than four.
//
//   Q1. Scenario:                              <- anchor; "Scenario:" means the prompt follows
//   <scenario paragraph>                       <- prompt, over one or more paragraphs
//   What is the most accurate reading ...?
//   A. <option>  B. <option>  C. <option>  D. <option>
//   Correct Answer: B          Mapped to: M1L1V1
//   Explanation for Option B (Correct): <text>
//   Explanation for Other Options:
//   A: <text>   C: <text>   D: <text>
//
// Two shapes vary between files and both are accepted:
//   * Modules 2 and 3 put the four options — and the key, the mapping and each label's text —
//     on ONE paragraph separated by <w:br/>. lib-lines splits on those, so they arrive as
//     separate lines exactly like modules 1 and 4.
//   * A label ("Explanation for Option B (Correct):") sometimes carries its text on the same
//     line and sometimes on the next one.
//
// PROMPT JOINING. A scenario prompt is two paragraphs in the source and is emitted as one
// line. Coursera's importer treats a second prompt paragraph as an unmatched line and rejects
// the question; prompt LENGTH is not a limit, its own reference prompt running ~800
// characters. Joining is therefore the safe direction. See README, "Accepted question grammar".
const path = require('path');
const { lines: rawLines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'bridging-soft-skills';
const LET = ['A', 'B', 'C', 'D'];
const MODULES = [1, 2, 3, 4];

const warn = [];
const quizzes = [];

// Section headings. Both files spell the separator as an en dash, but a hyphen or em dash
// would be an ordinary editorial slip rather than a different document.
const RE_MODULE = /^Module\s+(\d+)\s*[–—-]\s*(.+)$/i;
const RE_LESSON = /^Lesson\s+(\d+)\s*[–—-]\s*(.+)$/i;
const RE_ANCHOR = /^Q\s*(\d+)\s*[.)]\s*(.*)$/i;

/** One question block (anchor line first) -> the parsed question. */
function parseQuestion(blk, id) {
  const q = { num: 0, prompt: '', options: [], correct: null, feedback: {}, mapped: '' };
  const promptParts = [];
  let corrBuf = [];
  let corrLetter = null;
  let mode = 'prompt';
  let last = null;                       // letter whose incorrect explanation is being extended

  const head = blk[0].match(RE_ANCHOR);
  q.num = +head[1];
  const rest = head[2].trim();
  // "Q1. Scenario:" carries no prompt text; "Q2. Which pair ..." is the prompt itself.
  if (rest && !/^Scenario\s*:?$/i.test(rest)) promptParts.push(rest);

  for (let line of blk.slice(1)) {
    line = line.replace(/[✅❌]/g, '').trim();     // check / cross marks are decoration
    if (!line) continue;
    let m;

    // The key and the mapping share a line in some modules and split in others.
    let consumed = false;
    if ((m = line.match(/Correct Answer\s*:\s*([A-D])\b/i))) {
      q.correct = m[1].toUpperCase(); mode = 'afterKey'; consumed = true;
    }
    if ((m = line.match(/Mapped to\s*:\s*(M\d+L\d+V\d+)/i))) {
      q.mapped = m[1].toUpperCase(); mode = 'afterKey'; consumed = true;
    }
    if (consumed) continue;

    if ((m = line.match(/^Explanation for Option\s+([A-D])\s*\(\s*Correct\s*\)\s*:\s*(.*)$/i))) {
      corrLetter = m[1].toUpperCase(); mode = 'corr'; last = null;
      if (m[2].trim()) corrBuf.push(m[2].trim());
      continue;
    }
    if ((m = line.match(/^Explanations? for (?:Other|Incorrect) Options?\s*:\s*(.*)$/i))) {
      mode = 'inc'; last = null;
      if (m[1].trim()) {
        const im = m[1].trim().match(/^([A-D])\s*:\s*([\s\S]*)$/);
        if (im) { q.feedback[im[1].toUpperCase()] = im[2].trim(); last = im[1].toUpperCase(); }
      }
      continue;
    }

    if (mode === 'inc') {
      // "A: <explanation>" — a colon, where an option uses a full stop.
      if ((m = line.match(/^([A-D])\s*:\s*([\s\S]*)$/))) {
        last = m[1].toUpperCase(); q.feedback[last] = m[2].trim(); continue;
      }
      if (last) { q.feedback[last] += ' ' + line; continue; }
      warn.push(id + ': unattached line in the incorrect-options block -> "' + line.slice(0, 50) + '"');
      continue;
    }
    if (mode === 'corr') { corrBuf.push(line); continue; }

    // "A. <option text>" — a full stop, where an explanation uses a colon.
    if ((m = line.match(/^([A-D])\s*[.)]\s+([\s\S]*)$/))) {
      q.options.push({ letter: m[1].toUpperCase(), text: m[2].trim() });
      mode = 'opts'; last = m[1].toUpperCase();
      continue;
    }
    if (mode === 'opts' && last) {                      // wrapped option text
      const o = q.options.find(x => x.letter === last);
      if (o) { o.text += ' ' + line; continue; }
    }
    if (mode === 'afterKey') continue;
    promptParts.push(line);
  }

  if (corrLetter && corrBuf.length) {
    q.feedback[corrLetter] = corrBuf.join(' ').trim();
    if (q.correct && corrLetter !== q.correct) {
      warn.push(id + ': correct-option explanation is labelled ' + corrLetter +
        ' but the key says ' + q.correct);
    }
  }

  // One line, as the importer requires. Source paragraph breaks become single spaces.
  q.prompt = promptParts.join(' ').replace(/\s+/g, ' ').trim();

  if (!q.prompt) warn.push(id + ': no prompt');
  if (q.options.length !== 4) warn.push(id + ': ' + q.options.length + ' options');
  if (!q.correct) warn.push(id + ': no correct answer');
  if (!q.mapped) warn.push(id + ': no mapping');
  if (q.correct && !q.options.some(o => o.letter === q.correct)) {
    warn.push(id + ': key ' + q.correct + ' is not one of the options');
  }
  const miss = q.options.map(o => o.letter).filter(L => !q.feedback[L]);
  if (miss.length) warn.push(id + ': no feedback for ' + miss.join(','));
  const extra = Object.keys(q.feedback).filter(L => !LET.includes(L));
  if (extra.length) warn.push(id + ': feedback for unknown option ' + extra.join(','));
  // A prompt that opens "Word:" is read by the importer as an answer option, which silently
  // rejects the question. The "Scenario:" label is already gone; anything else is a source bug.
  if (/^[A-Za-z][A-Za-z ]{0,24}:\s/.test(q.prompt)) {
    warn.push(id + ': prompt starts with a label-like token -> "' + q.prompt.slice(0, 40) + '"');
  }
  return q;
}

/** Split a file's lines into question blocks, each starting at its anchor. */
function blocksOf(src, from, to) {
  const idx = [];
  for (let i = from; i < to; i++) if (RE_ANCHOR.test(src[i])) idx.push(i);
  return idx.map((s, k) => src.slice(s, k + 1 < idx.length ? idx[k + 1] : to));
}

for (const n of MODULES) {
  for (const kind of ['graded', 'practice']) {
    const dir = kind === 'graded' ? 'quiz' : 'practice';
    const file = path.join(SP, SLUG, dir, 'm' + n, 'word', 'document.xml');
    const src = rawLines(file).map(s => s.trim()).filter(Boolean);

    let moduleTitle = '';
    const mh = src.find(l => RE_MODULE.test(l));
    if (mh) {
      const m = mh.match(RE_MODULE);
      if (+m[1] !== n) warn.push(kind + ' m' + n + ': file says Module ' + m[1]);
      moduleTitle = m[2].trim();
    } else warn.push(kind + ' m' + n + ': no module heading');

    if (kind === 'graded') {
      const qs = blocksOf(src, 0, src.length)
        .map((blk, k) => parseQuestion(blk, 'M' + n + ' graded Q' + (k + 1)));
      quizzes.push({ kind, module: n, lesson: null, moduleTitle, lessonTitle: null, questions: qs });
      continue;
    }

    // Practice files carry one quiz per lesson. Each lesson heading opens a new quiz and
    // question numbering restarts at 1 inside it.
    const heads = [];
    src.forEach((l, i) => { if (RE_LESSON.test(l)) heads.push(i); });
    if (!heads.length) { warn.push('practice m' + n + ': no lesson headings — cannot split'); continue; }
    heads.forEach((start, k) => {
      const end = k + 1 < heads.length ? heads[k + 1] : src.length;
      const lm = src[start].match(RE_LESSON);
      const les = +lm[1];
      const qs = blocksOf(src, start + 1, end)
        .map((blk, j) => parseQuestion(blk, 'M' + n + 'L' + les + ' practice Q' + (j + 1)));
      if (!qs.length) { warn.push('M' + n + 'L' + les + ': practice lesson has no questions'); return; }
      // Every question in a lesson quiz should point inside that lesson.
      for (const q of qs) {
        if (q.mapped && !q.mapped.startsWith('M' + n + 'L' + les)) {
          warn.push('M' + n + 'L' + les + ' practice Q' + q.num +
            ': mapped to ' + q.mapped + ', outside its own lesson');
        }
      }
      quizzes.push({
        kind, module: n, lesson: les, moduleTitle, lessonTitle: lm[2].trim(), questions: qs,
      });
    });
  }
}

quizzes.sort((a, b) => a.module - b.module
  || (a.kind === b.kind ? (a.lesson || 0) - (b.lesson || 0) : a.kind === 'practice' ? -1 : 1));

if (process.argv.includes('--report')) {
  for (const z of quizzes) {
    const who = z.kind === 'graded'
      ? 'Module ' + z.module + ' graded'
      : 'Module ' + z.module + ' Lesson ' + z.lesson + ' practice';
    console.log(who.padEnd(34) + z.questions.length + ' questions  [' +
      z.questions.map(q => q.mapped || '??').join(' ') + ']');
  }
  const total = quizzes.reduce((a, z) => a + z.questions.length, 0);
  console.log('\n' + quizzes.length + ' quizzes · ' + total + ' questions · warnings: ' + warn.length);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify(quizzes, null, 2));
}
