// Parser for the CSTP Course 1 graded assessments (one file per module).
//
// Anchor carries the mapping, in three different styles:
//   "Question 1 – L1V1: The Hidden Cost of Poor Communication"     (module 1)
//   "Question 1 (C1M2L1V1)"                                        (module 2)
//   "Question 1 – C1M3L1V1 (Visualizing Trends Effectively)"       (module 3)
//
// Body, two styles:
//   Correct Answer: A) <option text>   |   Correct Answer: B)   |   Correct Answer: A
//   Explanation: <text>                |   Explanation (Correct): <text>
//   Incorrect Options:                 |   Explanation (Incorrect Options):
//   B) <text>  C) <text>  D) <text>    |   - <text>  - <text>  - <text>
//
// In the bullet style the entries carry no letter and correspond, in order, to the
// options other than the correct one.
const fs = require('fs');
const path = require('path');
const { lines: rawLines } = require('./lib-lines-strikeaware');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const LET = ['A', 'B', 'C', 'D'];

// Some questions put every option — or every incorrect explanation — on ONE line.
// Split by locating markers whose letters run in sequence from `expect`; a sequential
// run cannot occur by accident in prose.
function splitRun(line, expect) {
  const marks = [];
  const re = /(^|[\s;(])([A-D])\s*[).:]\s+/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    marks.push({ letter: m[2], at: m.index + (m[1] ? m[1].length : 0), textAt: m.index + m[0].length });
  }
  const run = [];
  let want = LET.indexOf(expect);
  for (const mk of marks) {
    if (want < LET.length && mk.letter === LET[want]) { run.push(mk); want++; }
  }
  if (run.length < 2) return null;
  const lead = line.slice(0, run[0].at).trim();
  const items = run.map((mk, i) => ({
    letter: mk.letter,
    text: line.slice(mk.textAt, i + 1 < run.length ? run[i + 1].at : line.length).trim(),
  }));
  if (items.some(o => o.text.length < 3)) return null;
  return { lead, items };
}
const warn = [];
const modules = [];

for (const n of [1, 2, 3]) {
  const src = rawLines(path.join(SP, 'cstp-course-1', `m${n}`, 'word', 'document.xml'))
    .map(s => s.trim());

  const cur = { num: n, title: '', questions: [] };
  modules.push(cur);

  const idx = [];
  src.forEach((l, i) => { if (/^Question\s*\d+\b/i.test(l)) idx.push(i); });

  idx.forEach((start, k) => {
    const end = k + 1 < idx.length ? idx[k + 1] : src.length;
    const blk = src.slice(start, end).filter(Boolean);

    const q = { prompt: [], options: [], correct: null, feedback: {}, mapped: '' };
    const head = blk[0];
    const mm = head.match(/L\s*(\d+)\s*V\s*(\d+)/i);
    if (mm) q.mapped = `M${n}L${mm[1]}V${mm[2]}`;

    let mode = 'prompt', last = null;
    const bullets = [];
    let corrBuf = [];

    for (const line of blk.slice(1)) {
      let m;

      if (/^Question\s*:?\s*$/i.test(line)) continue;          // stray "Question" label

      if ((m = line.match(/^Correct Answer\s*:\s*([A-D])\b/i))) {
        q.correct = m[1].toUpperCase(); mode = 'afterKey'; continue;
      }
      // "Correct Answer:" with the answer on the FOLLOWING line
      if (/^Correct Answer\s*:?\s*$/i.test(line)) { mode = 'awaitKey'; continue; }
      if (mode === 'awaitKey') {
        if ((m = line.match(/^([A-D])\b/))) { q.correct = m[1].toUpperCase(); mode = 'afterKey'; continue; }
        continue;
      }
      if ((m = line.match(/^Explanation\s*\(\s*Incorrect[^)]*\)\s*:\s*(.*)$/i))) {
        mode = 'inc'; last = null; if (m[1].trim()) bullets.push(m[1].trim()); continue;
      }
      if ((m = line.match(/^Explanation\s*(?:\(\s*Correct\s*\))?\s*:\s*(.*)$/i))) {
        mode = 'corr'; if (m[1].trim()) corrBuf.push(m[1].trim()); continue;
      }
      // label may be followed on the SAME line by all the explanations
      if ((m = line.match(/^Incorrect Options?\s*:?\s*(.*)$/i))) {
        mode = 'inc'; last = null;
        const rest = m[1].trim();
        if (rest) {
          const firstOther = q.options.map(o => o.letter).find(L2 => L2 !== q.correct) || 'B';
          const sr = splitRun(rest, firstOther);
          if (sr) { sr.items.forEach(it => { q.feedback[it.letter] = it.text; }); last = null; continue; }
          const im = rest.match(/^([A-D])\s*[).:]\s*([\s\S]*)$/);
          if (im) { q.feedback[im[1]] = im[2].trim(); last = im[1]; continue; }
          bullets.push(rest);
        }
        continue;
      }

      if (mode === 'inc') {
        const firstOther = q.options.map(o => o.letter).find(L2 => L2 !== q.correct) || 'B';
        const sr = splitRun(line, firstOther);
        if (sr) { sr.items.forEach(it => { q.feedback[it.letter] = it.text; }); last = null; continue; }
        if ((m = line.match(/^([A-D])\s*[).:]\s*([\s\S]*)$/))) {
          q.feedback[m[1]] = m[2].trim(); last = m[1]; continue;
        }
        if ((m = line.match(/^[-•·]\s*([\s\S]*)$/))) { bullets.push(m[1].trim()); last = null; continue; }
        if (last) { q.feedback[last] += ' ' + line; continue; }
        if (bullets.length) { bullets[bullets.length - 1] += ' ' + line; }
        continue;
      }
      if (mode === 'corr') { corrBuf.push(line); continue; }
      if (mode === 'afterKey') { continue; }

      // prompt / options — several questions put all four options on one line
      const sr = splitRun(line, LET[q.options.length] || 'A');
      if (sr) {
        if (sr.lead && !q.options.length) q.prompt.push(sr.lead);
        sr.items.forEach(it => q.options.push({ letter: it.letter, text: it.text }));
        mode = 'opts'; last = sr.items[sr.items.length - 1].letter;
        continue;
      }
      if ((m = line.match(/^([A-D])\s*[).]\s+([\s\S]*)$/))) {
        q.options.push({ letter: m[1], text: m[2].trim() });
        mode = 'opts'; last = m[1];
        continue;
      }
      if (mode === 'opts' && last) {
        const o = q.options.find(x => x.letter === last);
        if (o) { o.text += ' ' + line; continue; }
      }
      q.prompt.push(line);
    }

    // bullet-style incorrect explanations map, in order, to the non-correct options
    if (bullets.length) {
      const others = q.options.map(o => o.letter).filter(L2 => L2 !== q.correct);
      if (bullets.length === 1 && others.length > 1) {
        // one combined sentence covering every incorrect option (e.g. "Other options
        // increase confrontation.") — applied to each of them
        others.forEach(L2 => { if (!q.feedback[L2]) q.feedback[L2] = bullets[0]; });
        warn.push(`M${n} Q${k + 1}: single combined explanation reused for ${others.join(',')}`);
      } else {
        bullets.forEach((b, i) => { if (others[i] && !q.feedback[others[i]]) q.feedback[others[i]] = b; });
        if (bullets.length !== others.length) {
          warn.push(`M${n} Q${k + 1}: ${bullets.length} bullet explanations for ${others.length} incorrect options`);
        }
      }
    }
    if (q.correct && corrBuf.length) q.feedback[q.correct] = corrBuf.join(' ').trim();

    q.num = k + 1;
    cur.questions.push(q);

    const id = `M${n} Q${q.num}`;
    if (!q.prompt.length) warn.push(`${id}: no prompt`);
    if (q.options.length !== 4) warn.push(`${id}: ${q.options.length} options`);
    if (!q.correct) warn.push(`${id}: no correct answer`);
    if (!q.mapped) warn.push(`${id}: no mapping in anchor "${head.slice(0, 50)}"`);
    const miss = q.options.map(o => o.letter).filter(L2 => !q.feedback[L2]);
    if (miss.length) warn.push(`${id}: no feedback for ${miss.join(',')}`);
  });
}

if (process.argv[2] === '--report') {
  modules.forEach(mo => console.log(`Module ${mo.num}: ${mo.questions.length} questions`));
  console.log('\nwarnings: ' + warn.length);
  warn.forEach(w => console.log('  ' + w));
} else {
  console.log(JSON.stringify(modules, null, 2));
}
