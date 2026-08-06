// Parser for the "Course 1" PM graded assessment.
// The document mixes TWO question formats:
//
// Format A ("Q1"):                      Format B ("Question 4 | Mapped to: ..." or "Q. 10"):
//   Q1                                    Question 4   |   Mapped to: C1M1L1V3   |   ...
//   Question Type: Apply                  Scenario: ...
//   <prompt>                              <question line>
//   · A. opt ... · D. opt                 A. opt ... D. opt
//   ✅ Correct Answer: B                   ✅ Correct Answer: D
//   Mapped to: M1L1V1                     Feedback:
//   Explanation for Option B (Correct):    A: Incorrect. ...
//   <correct text>                         D: Correct. ...
//   Explanation for Other Options:
//   · A: ... · C: ... · D: ...
//
// Options and explanations sit on <w:br/>-separated lines inside one paragraph, so the
// line extractor splits on breaks.
const path = require('path');
const { lines: rawLines } = require('./lib-lines-strikeaware');

const SP = __dirname;
const src = rawLines(path.join(SP, 'pm-course-3', 'quiz', 'word', 'document.xml'));

const debullet = s => s.replace(/^[·••●▪*]\s*/, '').trim();
const LET = ['A', 'B', 'C', 'D'];

// Two questions carry NO "Mapped to:" line in the source (the ones labelled "Q. 10").
// Their subject matter matches exactly one video each, so the mapping is supplied here
// explicitly rather than silently left blank. Flagged to the user for confirmation.
//   M2 Q10 — "what should have been in the deliverable definition" (acceptance criteria)
//            -> M2L3V3 "Finalizing Deliverable Definition"
//   M3 Q10 — "which delay response strategy is being applied" (fast-tracking)
//            -> M3L3V3 "Planning Responses to Delays"
const MAPPING_FALLBACK = {};

const modules = [];
const warn = [];
let cur = null, q = null, mode = null, last = null;

function pushQ() {
  if (!q || !cur) { q = null; return; }
  q.num = cur.questions.length + 1;
  // "C1M1L1V3" -> "M1L1V3": the course prefix is not used by the video map.
  if (q.mapped) q.mapped = q.mapped.replace(/^C\d+/i, '');
  if (!q.mapped && MAPPING_FALLBACK[`M${cur.num}:${q.num}`]) {
    q.mapped = MAPPING_FALLBACK[`M${cur.num}:${q.num}`];
    q.mappingInferred = true;
  }
  // One question leaves a dangling "—" (and one stray "(") at the end of each option.
  q.options.forEach(o => { o.text = o.text.replace(/[\s—–-]+\(?\s*$/, '').trim(); });
  cur.questions.push(q);
  const id = `M${cur.num} Q${q.num}`;
  if (!q.prompt.length) warn.push(`${id}: no prompt`);
  if (q.options.length !== 4) warn.push(`${id}: ${q.options.length} options`);
  if (!q.correct) warn.push(`${id}: no correct answer`);
  if (!q.mapped) warn.push(`${id}: NO MAPPING in source`);
  else if (q.mappingInferred) warn.push(`${id}: mapping absent in source, inferred as ${q.mapped}`);
  const miss = q.options.map(o => o.letter).filter(L => !q.feedback[L]);
  if (miss.length) warn.push(`${id}: no feedback for ${miss.join(',')}`);
  q = null;
}

function newQ() { pushQ(); q = { prompt: [], options: [], correct: null, feedback: {}, mapped: '', cognitive: '' }; mode = 'head'; last = null; }

for (const raw of src) {
  if (!raw) continue;
  const line = raw.trim();
  let m;

  if ((m = line.match(/^Module\s+(\d+)\s*[–—-]\s*(.+)$/i))) {
    pushQ();
    cur = { num: +m[1], title: m[2].trim(), questions: [] };
    modules.push(cur);
    continue;
  }

  // anchors: "Q1", "Q. 10", "Q.10", "Question 4   |   Mapped to: ..."
  if (/^Q\s*\.?\s*\d+\s*$/i.test(line)) { newQ(); continue; }
  if ((m = line.match(/^Question\s+\d+\s*\|/i))) {
    newQ();
    const mm = line.match(/Mapped to:\s*([A-Za-z0-9]+)/i);
    if (mm) q.mapped = mm[1].trim();
    const bl = line.match(/Bloom's:\s*([^|]+)/i);
    if (bl) q.cognitive = bl[1].trim();
    continue;
  }
  if (!q) continue;

  if ((m = line.match(/^Question Type\s*:\s*(.+)$/i))) { q.cognitive = m[1].trim(); continue; }
  // lesson/video labels are metadata, not prompt text
  if (/^(Module Title|Lesson Title|Video)\s*:/i.test(line)) continue;
  if ((m = line.match(/^Mapped to\s*:\s*([A-Za-z0-9]+)/i))) { q.mapped = m[1].trim(); continue; }
  if ((m = line.match(/^\s*(?:✅\s*)?Correct Answer\s*:\s*([A-D])\b/i))) {
    q.correct = m[1].toUpperCase();
    // some questions put the key and the mapping on one line:
    //   "✅ Correct Answer: B | Mapped to: C2M1L3V3"
    const mm = line.match(/Mapped to\s*:\s*([A-Za-z0-9]+)/i);
    if (mm) q.mapped = mm[1].trim();
    mode = 'afterKey'; continue;
  }
  if ((m = line.match(/^Explanation for Option\s+([A-D])\s*\(Correct\)\s*:\s*(.*)$/i))) {
    q.feedback[m[1].toUpperCase()] = m[2].trim();
    last = m[1].toUpperCase(); mode = 'corr'; continue;
  }
  if (/^Explanation for Other Options\s*:?\s*$/i.test(line)) { mode = 'inc'; last = null; continue; }
  if (/^Feedback\s*:?\s*$/i.test(line)) { mode = 'inc'; last = null; continue; }

  const t = debullet(line);

  if (mode === 'inc') {
    // One question labels entries in lower case with no space ("a.(Incorrect) text").
    // The "(Correct)" / "(Incorrect)" marker is a label, not feedback, so it is dropped.
    if ((m = t.match(/^([A-Da-d])\s*[:.)]\s*([\s\S]*)$/))) {
      const letter = m[1].toUpperCase();
      const text = m[2].replace(/^\(?\s*(Correct|Incorrect)\s*\)?\s*[:.]?\s*/i, '').trim();
      if (text) { q.feedback[letter] = text; last = letter; continue; }
      last = letter; continue;
    }
    if (last) { q.feedback[last] += ' ' + t; }
    continue;
  }
  if (mode === 'corr') {
    if (last) { q.feedback[last] = (q.feedback[last] ? q.feedback[last] + ' ' : '') + t; }
    continue;
  }
  if (mode === 'afterKey') continue;

  // head region: options are "A. text" (optionally bulleted); anything before is prompt
  if ((m = t.match(/^([A-D])\.\s+([\s\S]*)$/))) {
    q.options.push({ letter: m[1], text: m[2].trim() });
    mode = 'opts'; last = m[1];
    continue;
  }
  if (mode === 'opts' && last) {
    const o = q.options.find(x => x.letter === last);
    if (o) { o.text += ' ' + t; continue; }
  }
  q.prompt.push(t);
}
pushQ();

if (process.argv[2] === '--report') {
  modules.forEach(mo => console.log(`Module ${mo.num} — ${mo.title}: ${mo.questions.length} questions`));
  console.log('\nwarnings: ' + warn.length);
  warn.forEach(w => console.log('  ' + w));
} else {
  console.log(JSON.stringify(modules, null, 2));
}
