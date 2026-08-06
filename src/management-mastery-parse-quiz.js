// Parser for the "Management Mastery: Motivation" graded quiz.
//
// Shape:
//   M1, L1, V1 – SMART Goals            <- mapping header, carries the video title too
//   1. <prompt>
//   A. option ... D. option
//   Correct Answer: B
//   Explanations for Option B (correct):
//   <correct explanation>
//   Explanation for Other Options:
//   A:  <text>   C: <text>   D: <text>
//
// Struck-through ("cut") text is superseded draft wording and is dropped by the extractor.
const path = require('path');
const { lines: rawLines } = require('./lib-lines-strikeaware');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const src = rawLines(path.join(SP, 'management-mastery', 'quiz', 'word', 'document.xml')).map(s => s.trim());

const HEAD = /^M\s*(\d+)\s*,\s*L\s*(\d+)\s*,\s*V\s*(\d+)\s*(?:[–—-]\s*(.*))?$/i;
const modules = [];
const byNum = {};
const warn = [];

const idx = [];
src.forEach((l, i) => { if (HEAD.test(l)) idx.push(i); });

idx.forEach((start, k) => {
  const end = k + 1 < idx.length ? idx[k + 1] : src.length;
  const blk = src.slice(start, end).filter(Boolean);

  const hm = blk[0].match(HEAD);
  const modNum = +hm[1];
  const mapped = `M${hm[1]}L${hm[2]}V${hm[3]}`;

  let cur = byNum[modNum];
  if (!cur) { cur = byNum[modNum] = { num: modNum, title: '', questions: [] }; modules.push(cur); }

  const q = { prompt: '', options: [], correct: null, feedback: {}, mapped };
  let mode = 'prompt', last = null, corrBuf = [], corrLetter = null;

  for (const line of blk.slice(1)) {
    let m;

    if ((m = line.match(/^Correct Answer\s*:\s*([A-D])\b/i))) {
      q.correct = m[1].toUpperCase(); mode = 'afterKey'; continue;
    }
    if ((m = line.match(/^Explanations?\s*for\s*Option\s*([A-D])\.?\s*\(\s*correct\s*\)\s*:\s*(.*)$/i))) {
      corrLetter = m[1].toUpperCase();
      if (m[2].trim()) corrBuf.push(m[2].trim());
      mode = 'corr'; continue;
    }
    if (/^Explanations?\s*for\s*Other\s*Options\s*:?\s*$/i.test(line)) { mode = 'inc'; last = null; continue; }

    if (mode === 'inc') {
      if ((m = line.match(/^([A-D])\s*[:.]\s+([\s\S]*)$/))) {
        q.feedback[m[1]] = m[2].trim(); last = m[1]; continue;
      }
      if (last) { q.feedback[last] += ' ' + line; }
      continue;
    }
    if (mode === 'corr') { corrBuf.push(line); continue; }
    if (mode === 'afterKey') continue;

    // prompt / options
    if ((m = line.match(/^([A-D])\.\s+([\s\S]*)$/))) {
      q.options.push({ letter: m[1], text: m[2].trim() });
      mode = 'opts'; last = m[1];
      continue;
    }
    if (mode === 'opts' && last) {
      const o = q.options.find(x => x.letter === last);
      if (o) { o.text += ' ' + line; continue; }
    }
    // strip the leading question number
    const t = line.replace(/^\d+\s*[.)]\s*/, '');
    q.prompt = q.prompt ? q.prompt + ' ' + t : t;
  }

  // One question contains TWO complete option sets, neither struck. Elsewhere in this
  // document the revision is the later, longer wording, so the last full set is kept.
  if (q.options.length > 4 && q.options.length % 4 === 0) {
    const sets = q.options.length / 4;
    q.options = q.options.slice(-4);
    warn.push(`M${modNum} Q${cur.questions.length + 1}: ${sets} duplicate option sets in source, kept the last`);
  }

  const letter = corrLetter || q.correct;
  if (letter && corrBuf.length) q.feedback[letter] = corrBuf.join(' ').trim();
  if (corrLetter && q.correct && corrLetter !== q.correct) {
    warn.push(`M${modNum} Q${cur.questions.length + 1}: key is ${q.correct} but explanation labels ${corrLetter}`);
  }

  q.num = cur.questions.length + 1;
  cur.questions.push(q);

  const id = `M${modNum} Q${q.num}`;
  if (!q.prompt) warn.push(`${id}: no prompt`);
  if (q.options.length !== 4) warn.push(`${id}: ${q.options.length} options`);
  if (!q.correct) warn.push(`${id}: no correct answer`);
  const miss = q.options.map(o => o.letter).filter(L => !q.feedback[L]);
  if (miss.length) warn.push(`${id}: no feedback for ${miss.join(',')}`);
});

modules.sort((a, b) => a.num - b.num);

if (process.argv[2] === '--report') {
  modules.forEach(mo => console.log(`Module ${mo.num}: ${mo.questions.length} questions`));
  console.log('\nwarnings: ' + warn.length);
  warn.forEach(w => console.log('  ' + w));
} else {
  console.log(JSON.stringify(modules, null, 2));
}
