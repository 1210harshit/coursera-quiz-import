// Parser for the GenAI Retail Inventory graded quiz.
// Block shape (clean and consistent throughout this document):
//   Q1
//   Module: Module 1
//   Mapped to: M1L1V1
//   Cognitive Level: Understand
//   Question: <prompt>
//   A. option ... D. option
//   ✅ Correct Answer: D
//   Feedback
//   A. feedback ... D. feedback
const fs = require('fs');
const path = require('path');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const xml = fs.readFileSync(path.join(SP, 'genai-retail', 'quiz', 'word', 'document.xml'), 'utf8');
const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
                  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [null, xml])[1];
const paras = [];
const pRe = /<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
let pm;
while ((pm = pRe.exec(body)) !== null) {
  let t = '';
  const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let tm;
  while ((tm = tRe.exec(pm[0])) !== null) t += dec(tm[1]);
  paras.push(t.replace(/ /g, ' ').trim());
}

const modules = [];
const warn = [];
let cur = null, q = null, mode = null, lastLetter = null;

function pushQ() {
  if (!q || !cur) { q = null; return; }
  q.num = cur.questions.length + 1;
  cur.questions.push(q);
  const id = `M${cur.num} Q${q.num}`;
  if (!q.prompt) warn.push(`${id}: no prompt`);
  if (q.options.length !== 4) warn.push(`${id}: ${q.options.length} options`);
  if (!q.correct) warn.push(`${id}: no correct answer`);
  if (!q.mapped) warn.push(`${id}: no mapping`);
  const miss = q.options.map(o => o.letter).filter(L => !q.feedback[L]);
  if (miss.length) warn.push(`${id}: no feedback for ${miss.join(',')}`);
  q = null;
}

for (const line of paras) {
  if (!line) continue;
  let m;

  if ((m = line.match(/^MODULE\s+(\d+)\s*[—–-]\s*(.+)$/i))) {
    pushQ();
    cur = { num: +m[1], title: m[2].trim(), questions: [] };
    modules.push(cur);
    continue;
  }
  if (/^Q\d+$/.test(line)) {
    pushQ();
    q = { prompt: '', options: [], correct: null, feedback: {}, mapped: '', cognitive: '' };
    mode = 'head'; lastLetter = null;
    continue;
  }
  if (!q) continue;

  if (/^Module:\s*/i.test(line)) continue;
  if ((m = line.match(/^Mapped to:\s*(\S+)/i))) { q.mapped = m[1].trim(); continue; }
  if ((m = line.match(/^Cognitive Level:\s*(.+)$/i))) { q.cognitive = m[1].trim(); continue; }
  if ((m = line.match(/^Question:\s*([\s\S]*)$/i))) { q.prompt = m[1].trim(); mode = 'opts'; continue; }
  if ((m = line.match(/^\s*(?:✅\s*)?Correct Answer:\s*([A-D])\b/i))) {
    q.correct = m[1].toUpperCase(); mode = 'awaitFb'; continue;
  }
  if (/^Feedback\s*:?\s*$/i.test(line)) { mode = 'fb'; lastLetter = null; continue; }

  if ((m = line.match(/^([A-D])\.\s+([\s\S]*)$/))) {
    if (mode === 'opts') { q.options.push({ letter: m[1], text: m[2].trim() }); lastLetter = m[1]; continue; }
    if (mode === 'fb')   { q.feedback[m[1]] = m[2].trim(); lastLetter = m[1]; continue; }
  }
  // continuation lines
  if (mode === 'opts' && lastLetter) {
    const o = q.options.find(x => x.letter === lastLetter);
    if (o) { o.text += ' ' + line; continue; }
  }
  if (mode === 'fb' && lastLetter) { q.feedback[lastLetter] += ' ' + line; continue; }
  if (mode === 'opts' && !q.options.length && q.prompt) { q.prompt += ' ' + line; continue; }
}
pushQ();

if (process.argv[2] === '--report') {
  modules.forEach(mo => console.log(`Module ${mo.num} — ${mo.title}: ${mo.questions.length} questions`));
  console.log('\nwarnings: ' + warn.length);
  warn.forEach(w => console.log('  ' + w));
} else {
  console.log(JSON.stringify(modules, null, 2));
}
