// Parser for the "GenAI for Application Development & Engineering" graded quiz.
//
// Shape:
//   Course Name: Module 1          <- module 1 boundary
//   Module Name and Number: 2      <- later module boundaries
//   L1V1                           <- mapping for the NEXT question (module prefix implied)
//   Q1
//   <prompt>
//   A
//   <option text>
//   Feedback
//   (Incorrect): <feedback>
//   ... B, C, D ...
//
// There is no explicit answer key: the correct option is the one whose feedback is
// labelled "(Correct)". Struck-through ("cut") text is dropped by the line extractor,
// and the "(Correct)" / "(Incorrect)" labels are removed from the feedback text.
const path = require('path');
const { lines: rawLines } = require('./lib-lines-strikeaware');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const src = rawLines(path.join(SP, 'genai-appdev', 'quiz', 'word', 'document.xml'));

// Four questions carry no "LxVy" line in the source. Their subject matter identifies a
// single video each, so the mapping is supplied explicitly and reported to the user.
//   M1 Q10 — "which is NOT a key testing category"      -> M1L3V3 Testing and Debugging AI-Generated Code
//   M2 Q5  — UI mockups / accessibility in UX planning   -> M2L1V3 Case Study on AI in Design Phase
//   M2 Q10 — automating documentation workflows          -> M2L3V3 Automating Documentation Workflows with AI
//   M4 Q6  — AI monitoring reduces alert fatigue         -> M4L2V3 Automated Monitoring & Alerting with AI
const MAPPING_FALLBACK = {
  'M1:10': 'M1L3V3',
  'M2:5':  'M2L1V3',
  'M2:10': 'M2L3V3',
  'M4:6':  'M4L2V3',
};

const modules = [];
const warn = [];
let cur = null, q = null, pendingMap = null;
let mode = null, curLetter = null;

function pushQ() {
  if (!q || !cur) { q = null; return; }
  q.num = cur.questions.length + 1;
  if (!q.mapped && MAPPING_FALLBACK[`M${cur.num}:${q.num}`]) {
    q.mapped = MAPPING_FALLBACK[`M${cur.num}:${q.num}`];
    q.mappingInferred = true;
  }
  cur.questions.push(q);

  const id = `M${cur.num} Q${q.num}`;
  if (!q.prompt) warn.push(`${id}: no prompt`);
  if (q.options.length !== 4) warn.push(`${id}: ${q.options.length} options`);
  if (!q.correct) warn.push(`${id}: no option marked (Correct)`);
  if (!q.mapped) warn.push(`${id}: NO MAPPING in source`);
  else if (q.mappingInferred) warn.push(`${id}: mapping absent in source, inferred as ${q.mapped}`);
  const miss = q.options.map(o => o.letter).filter(L => !q.feedback[L]);
  if (miss.length) warn.push(`${id}: no feedback for ${miss.join(',')}`);
  q = null;
}

for (const raw of src) {
  const line = (raw || '').trim();
  if (!line) continue;
  let m;

  // module boundaries
  if ((m = line.match(/^Course Name\s*:\s*Module\s*(\d+)/i))) {
    pushQ(); cur = { num: +m[1], title: '', questions: [] }; modules.push(cur); pendingMap = null; continue;
  }
  if ((m = line.match(/^Module Name and Number\s*:\s*(\d+)/i))) {
    pushQ(); cur = { num: +m[1], title: '', questions: [] }; modules.push(cur); pendingMap = null; continue;
  }
  if (/^Graded Quiz\b/i.test(line)) continue;

  // mapping applies to the question that follows
  if ((m = line.match(/^L(\d+)V(\d+)$/i))) { pendingMap = `L${m[1]}V${m[2]}`; continue; }

  if ((m = line.match(/^Q(\d+)$/i))) {
    pushQ();
    q = { prompt: '', options: [], correct: null, feedback: {}, mapped: '' };
    if (pendingMap && cur) { q.mapped = `M${cur.num}${pendingMap}`; pendingMap = null; }
    mode = 'prompt'; curLetter = null;
    continue;
  }
  if (!q) continue;

  if (/^Feedback$/i.test(line)) { mode = 'fb'; continue; }

  if (/^[A-D]$/.test(line) && mode !== 'fb') {
    curLetter = line; mode = 'optText';
    q.options.push({ letter: curLetter, text: '' });
    continue;
  }
  // a bare letter right after a feedback also starts the next option
  if (/^[A-D]$/.test(line) && mode === 'fb') {
    curLetter = line; mode = 'optText';
    q.options.push({ letter: curLetter, text: '' });
    continue;
  }

  if (mode === 'fb' && curLetter) {
    // "(Correct): text" / "(Incorrect): text" / bare text
    // Label punctuation varies: "(Correct)", "(Correct):", "(Incorrect): ." — and in one
    // case the label line holds only a stray full stop with the text on the next line.
    const lm = line.match(/^\((Correct|Incorrect)\)\s*[:.]?\s*([\s\S]*)$/i);
    let text = lm ? lm[2].trim() : line;
    if (lm && /^correct$/i.test(lm[1])) q.correct = curLetter;
    if (/^[.\s:;,–—-]*$/.test(text)) text = '';       // punctuation-only remnant
    if (!text) continue;
    q.feedback[curLetter] = q.feedback[curLetter]
      ? q.feedback[curLetter] + ' ' + text
      : text;
    continue;
  }
  if (mode === 'optText' && curLetter) {
    const o = q.options.find(x => x.letter === curLetter);
    if (o) { o.text = o.text ? o.text + ' ' + line : line; }
    continue;
  }
  if (mode === 'prompt') { q.prompt = q.prompt ? q.prompt + ' ' + line : line; continue; }
}
pushQ();

if (process.argv[2] === '--report') {
  modules.forEach(mo => console.log(`Module ${mo.num}: ${mo.questions.length} questions`));
  console.log('\nwarnings: ' + warn.length);
  warn.forEach(w => console.log('  ' + w));
} else {
  console.log(JSON.stringify(modules, null, 2));
}
