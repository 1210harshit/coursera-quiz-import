// Parser for the GenAI for Marketing graded assessment.
// The source is inconsistently formatted, so this tolerates:
//   - options as bare bullets (no letter) OR "A." / "A)" / "A:" / "• B." prefixes
//   - two options accidentally merged into one paragraph
//   - correct explanation inline after the label OR on following lines
//   - incorrect-explanation headers: "Explanations for Incorrect Options",
//     "Incorrect Answer Explanations", "Explanation for Incorrect Options"
//   - incorrect entries as "A: x", "A. x", "A x", optionally bulleted
//   - "Mapped to" / "Mapped To", with stray leading/trailing spaces
const fs = require('fs');
const path = require('path');

const SP = __dirname;
const xml = fs.readFileSync(path.join(SP, 'genai-marketing', 'quiz', 'word', 'document.xml'), 'utf8');
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
  paras.push({ t: t.replace(/ /g, ' ').trim() });
}

const isSep  = s => /^[-–—_]{10,}$/.test(s.replace(/\s/g, ''));
const debullet = s => s.replace(/^[•·●▪*\-\s]+/, '');
const LET = ['A', 'B', 'C', 'D', 'E', 'F'];

const RE = {
  qline:  /^Question\s*\d+\s*[:.)]?\s*(.*)$/i,
  key:    /^Correct\s*Answer\s*:\s*([A-D])\b/i,
  corr:   /^(?:Correct\s*Answer\s*Explanation|Correct\s*Explanation|Explanation)\s*:\s*(.*)$/i,
  // Seen in the source: "Explanations for Incorrect Options:", "Incorrect Answer
  // Explanations:", "Explanations for incorrect answers:". Deliberately does NOT match a
  // bare "Explanation:", which labels the CORRECT answer.
  incHdr: /^(?:Explanations?\s*(?:for|of)\s*(?:the\s*)?incorrect\s*(?:options?|answers?|choices?)|Incorrect\s*(?:Answers?|Options?|Choices?)\s*Explanations?)\s*:?\s*$/i,
  mapped: /^Mapped\s*To\s*:\s*(\S+)/i,
  opt:    /^([A-D])\s*[.):]\s+(.+)$/,
};

// Split "B. foo C. bar" into two options when the embedded letter is the next expected one.
function splitMerged(text, nextLetter) {
  const re = new RegExp(`\\s+(?=${nextLetter}\\s*[.):]\\s)`);
  const i = text.search(re);
  if (i < 0) return null;
  return [text.slice(0, i).trim(), text.slice(i).trim()];
}

const modules = [];
let cur = null, block = [];
const warn = [];

function flush() {
  const blk = block.filter(p => p.t);
  block = [];
  if (!blk.length || !cur) return;
  if (!blk.some(p => RE.key.test(p.t))) return;

  const q = { prompt: '', options: [], correct: null, feedback: {}, mapped: '' };
  let mode = 'head', lastInc = null, corrBuf = [];

  for (const p of blk) {
    const raw = p.t;
    const t = debullet(raw);
    let m;

    if ((m = raw.match(RE.key)) || (m = t.match(RE.key))) {
      q.correct = m[1].toUpperCase(); mode = 'key'; continue;
    }
    if ((m = t.match(RE.corr))) { corrBuf = m[1].trim() ? [m[1].trim()] : []; mode = 'corr'; continue; }
    if (RE.incHdr.test(t)) { mode = 'inc'; continue; }
    if ((m = t.match(RE.mapped))) { q.mapped = m[1].trim(); mode = 'done'; continue; }

    if (mode === 'inc') {
      // "A: x" / "A. x" / "A x". Three questions in Module 2 carry TWO incorrect-explanation
      // blocks; the later one is the fuller, revised text, so a repeat letter overwrites.
      // A stray extra ":" or "." after the label (source typo "A: : text") is dropped.
      if ((m = t.match(/^([A-D])\s*[:.)]?\s+([\s\S]*)$/))) {
        q.feedback[m[1]] = m[2].replace(/^[:.\s]+/, '').trim();
        lastInc = m[1];
        continue;
      }
      if (lastInc) { q.feedback[lastInc] += ' ' + t; }
      continue;
    }
    if (mode === 'corr') { corrBuf.push(t); continue; }
    // Some questions put the correct-answer explanation straight after "Correct Answer: X"
    // with no label at all. Any unrecognised line here is that explanation.
    if (mode === 'key') { corrBuf.push(t); continue; }

    // head region: prompt then options
    if (!q.prompt) {
      const qm = t.match(RE.qline);
      const text = qm ? qm[1].trim() : t;
      if (text) { q.prompt = text; continue; }
      continue;
    }
    const om = t.match(RE.opt);
    q.options.push(om ? { letter: om[1], text: om[2].trim() } : { letter: null, text: t });
  }

  // repair merged options ("B. foo C. bar")
  for (let i = 0; i < q.options.length && q.options.length < 4; i++) {
    const want = LET[q.options.length];       // the letter we are missing next
    for (let j = 0; j < q.options.length; j++) {
      const parts = splitMerged(q.options[j].text, LET[j + 1]) ||
                    splitMerged(q.options[j].text, want);
      if (parts) {
        const om = parts[1].match(RE.opt);
        q.options[j] = { letter: q.options[j].letter, text: parts[0] };
        q.options.splice(j + 1, 0, om ? { letter: om[1], text: om[2].trim() } : { letter: null, text: parts[1] });
        break;
      }
    }
  }

  q.options = q.options.map((o, i) => ({ letter: o.letter || LET[i], text: o.text }));
  if (corrBuf.length && q.correct) q.feedback[q.correct] = corrBuf.join(' ').replace(/^Correct[.:]\s*/i, '').trim();

  q.num = cur.questions.length + 1;
  cur.questions.push(q);

  const id = `M${cur.num} Q${q.num}`;
  if (q.options.length !== 4) warn.push(`${id}: ${q.options.length} options`);
  if (!q.correct) warn.push(`${id}: no correct answer`);
  if (!q.mapped) warn.push(`${id}: no mapping`);
  if (!q.prompt) warn.push(`${id}: no prompt`);
  const miss = q.options.map(o => o.letter).filter(L => !q.feedback[L]);
  if (miss.length) warn.push(`${id}: no feedback for ${miss.join(',')}`);
  const lettersOk = q.options.every((o, i) => o.letter === LET[i]);
  if (!lettersOk) warn.push(`${id}: option letters out of order (${q.options.map(o => o.letter).join('')})`);
}

for (const p of paras) {
  const m = p.t.match(/^Module\s+(\d+)\s*$/);
  if (m) { flush(); cur = { num: +m[1], title: '', questions: [] }; modules.push(cur); continue; }
  if (isSep(p.t)) { flush(); continue; }
  block.push(p);
}
flush();

if (process.argv[2] === '--report') {
  modules.forEach(mo => console.log(`Module ${mo.num}: ${mo.questions.length} questions`));
  console.log('\nwarnings: ' + warn.length);
  warn.forEach(w => console.log('  ' + w));
} else {
  console.log(JSON.stringify(modules, null, 2));
}
