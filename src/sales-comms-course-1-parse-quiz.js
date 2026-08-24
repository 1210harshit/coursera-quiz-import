// Rapport Mastery (Course 1) — Graded_Quiz_Course1.docx -> quiz.json
//
// One assessment, thirty questions, three module sections. The outline backs that up: Course 1
// carries a single "Graded Quiz" row of 30 minutes in its Supplementary Items table, not one
// per module. Questions are therefore renumbered 1-30 in document order; the source restarts at
// Q1 inside each module section, which would give the importer three Question 1s.
//
// SOURCE SHAPE. This is the first quiz in the repo written as tables. Each module section opens
// with its first question laid out as a table and writes the remaining nine as plain
// paragraphs, so both forms have to be read:
//
//   table row ["Q1  Which of the ..."]          paragraph  Q1  Which of the ...
//   table row ["Mapped to: M1L1V1"]             paragraph  Mapped to: M1L1V1
//   table row ["A", "Buyers have more ..."]     paragraph  A
//                                               paragraph  Buyers have more ...
//   table row ["Feedback", "While competi..."]  paragraph  Feedback
//                                               paragraph  While competi...
//
// Flattening every table row into its cells in order produces exactly the paragraph sequence,
// so one line-based reader handles both.
//
// THE ANSWER KEY IS THE LABEL. There is no "Correct Answer: B" line anywhere. The correct
// option's explanation is headed "Correct" where the others are headed "Feedback" — the source
// also colours that letter green, but the label is the reliable signal and colour is not read.
const path = require('path');
const { readBlocks } = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'sales-comms-course-1';
const LET = ['A', 'B', 'C', 'D'];

const warn = [];

// "Q1  Which of the ..." and "Q3. What shift ..." — the full stop is inconsistent, and the
// question text is split across many runs in the source, which readBlocks has already joined.
const RE_ANCHOR = /^Q\s*(\d+)\s*[.)]?\s+(.*\S.*)$/;
const RE_MODULE = /^Module\s+(\d+)\s*:\s*(.+?)\s*(?:\(\s*Q\s*\d+\s*[–—-]\s*Q?\s*\d+\s*\))?$/i;
const RE_MAPPED = /^Mapped to\s*:\s*(M\d+L\d+V\d+)\s*$/i;
const RE_LETTER = /^([A-D])$/;
const RE_LABEL = /^(Feedback|Correct)$/i;

// Paragraphs and table cells in document order. A table row contributes its cells left to
// right, which is the same sequence the paragraph form writes.
function flatten(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.type === 'p') { if (b.text.trim()) out.push(b.text.trim()); continue; }
    for (const row of b.rows) for (const cell of row) {
      const t = (cell || '').trim();
      if (t) out.push(t);
    }
  }
  return out;
}

const lines = flatten(readBlocks(path.join(SP, SLUG, 'quiz', 'word', 'document.xml')));

// --- split into module sections, then into question blocks -------------------------------
const sections = [];
lines.forEach((l, i) => {
  const m = l.match(RE_MODULE);
  if (m) sections.push({ at: i, number: +m[1], title: m[2].trim() });
});
if (!sections.length) warn.push('no module headings found');

const questions = [];
sections.forEach((sec, si) => {
  const end = si + 1 < sections.length ? sections[si + 1].at : lines.length;
  const idx = [];
  for (let i = sec.at + 1; i < end; i++) if (RE_ANCHOR.test(lines[i])) idx.push(i);
  if (!idx.length) { warn.push('Module ' + sec.number + ': no questions'); return; }

  idx.forEach((start, k) => {
    const blk = lines.slice(start, k + 1 < idx.length ? idx[k + 1] : end);
    const srcNum = +blk[0].match(RE_ANCHOR)[1];
    const id = 'M' + sec.number + ' Q' + srcNum;

    const q = {
      num: 0, srcNum, module: sec.number, moduleTitle: sec.title,
      prompt: '', options: [], correct: null, feedback: {}, mapped: '',
    };
    const promptParts = [blk[0].match(RE_ANCHOR)[2].trim()];
    let mode = 'prompt';
    let letter = null;         // option whose text or explanation is being collected
    let label = null;          // 'Feedback' | 'Correct' for the pending explanation

    for (const line of blk.slice(1)) {
      let m;
      if ((m = line.match(RE_MAPPED))) { q.mapped = m[1].toUpperCase(); mode = 'idle'; continue; }
      if ((m = line.match(RE_LETTER))) {
        letter = m[1]; label = null; mode = 'optText';
        q.options.push({ letter, text: '' });
        continue;
      }
      if ((m = line.match(RE_LABEL))) {
        label = m[1].toLowerCase() === 'correct' ? 'Correct' : 'Feedback';
        if (label === 'Correct') {
          if (q.correct) warn.push(id + ': more than one option headed "Correct"');
          q.correct = letter;
        }
        mode = 'expl';
        continue;
      }
      if (mode === 'optText' && letter) {
        const o = q.options[q.options.length - 1];
        o.text = o.text ? o.text + ' ' + line : line;
        continue;
      }
      if (mode === 'expl' && letter) {
        q.feedback[letter] = q.feedback[letter] ? q.feedback[letter] + ' ' + line : line;
        continue;
      }
      if (mode === 'prompt') { promptParts.push(line); continue; }
      warn.push(id + ': unattached line -> "' + line.slice(0, 60) + '"');
    }

    // One line, as the importer requires.
    q.prompt = promptParts.join(' ').replace(/\s+/g, ' ').trim();
    q.num = questions.length + 1;
    questions.push(q);

    if (!q.prompt) warn.push(id + ': no prompt');
    if (q.options.length !== 4) warn.push(id + ': ' + q.options.length + ' options');
    if (q.options.some(o => !o.text)) {
      warn.push(id + ': empty option text for ' + q.options.filter(o => !o.text).map(o => o.letter).join(','));
    }
    if (!q.correct) warn.push(id + ': no option headed "Correct"');
    if (!q.mapped) warn.push(id + ': no mapping');
    const miss = q.options.map(o => o.letter).filter(L => !q.feedback[L]);
    if (miss.length) warn.push(id + ': no explanation for ' + miss.join(','));
    const letters = q.options.map(o => o.letter).join('');
    if (letters !== LET.join('')) warn.push(id + ': option letters are "' + letters + '"');
    if (q.mapped && !q.mapped.startsWith('M' + sec.number)) {
      warn.push(id + ': mapped to ' + q.mapped + ', outside its own module section');
    }
    // A prompt opening with a SINGLE word and a colon is read by the importer as an answer
    // option -- the failure that rejected every "Scenario:" question in the osha source. That
    // is the documented shape, and it is a defect. A multi-word phrase before the colon ("A
    // buyer says:") does not match that shape, so it is reported separately for a human to
    // judge rather than silently rewritten; the wording is the author's.
    if (/^[A-Za-z0-9]+\s*:\s/.test(q.prompt)) {
      warn.push(id + ': prompt opens "' + q.prompt.split(':')[0]
        + ':" which the importer will read as an answer option');
    } else if (/^.{0,30}?:\s/.test(q.prompt)) {
      warn.push(id + ': REVIEW early colon in prompt -> "' + q.prompt.slice(0, 52) + '"');
    }
  });
});

const quiz = {
  kind: 'graded',
  scope: 'course',
  questions,
  modules: sections.map(s => ({ number: s.number, title: s.title })),
};

if (process.argv.includes('--report')) {
  for (const s of quiz.modules) {
    const qs = questions.filter(q => q.module === s.number);
    console.log('Module ' + s.number + ' — ' + s.title);
    console.log('   ' + qs.length + ' questions  (source Q' + qs[0].srcNum + '-Q' + qs[qs.length - 1].srcNum
      + ' -> Question ' + qs[0].num + '-' + qs[qs.length - 1].num + ')');
    console.log('   keys: ' + qs.map(q => q.correct).join(' '));
    console.log('   maps: ' + qs.map(q => q.mapped).join(' '));
  }
  console.log('\n' + questions.length + ' questions · warnings: ' + warn.length);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify(quiz, null, 2));
}
