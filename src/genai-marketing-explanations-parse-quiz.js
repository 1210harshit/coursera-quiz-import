// Parser for "Sam - Graded Assessments with explanations" (GenAI for Marketing).
//
// Block shape (separator-delimited):
//   1. <prompt>                 (or "Question 4: <prompt>")
//   A. option ... D. option
//   Correct Answer: B
//   <explanation of the correct answer>
//   Explanations for Incorrect Options
//   A: <text>
//   B :Correct Answer           <- placeholder for the correct option, NOT feedback
//   C: <text>  D: <text>
//   Mapped to: Module 1, Lesson 1  <lesson title>, Video 1: <video title>.
//
// The correct option's feedback comes from the explanation paragraph after
// "Correct Answer: X" — never from the "Correct Answer"/"Correct option" placeholder.
const path = require('path');
const { lines: rawLines } = require('./lib-lines');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const src = rawLines(path.join(SP, 'genai-marketing-explanations', 'quiz', 'word', 'document.xml'));

const isSep = s => /^[-–—_]{10,}$/.test(s.replace(/\s/g, ''));
// "Correct Answer", "Correct option", "Correct", possibly with brackets/punctuation
const isCorrectPlaceholder = s =>
  /^\(?\s*correct(\s+(answer|option|choice))?\s*\)?\s*[.:]?\s*$/i.test(s.trim());

const RE = {
  anchor: /^(?:Question\s*\d+\s*[:.)]|\d+\s*[.)])\s*(.*)$/i,
  opt:    /^([A-D])\s*[.)]\s+(.+)$/,
  key:    /^Correct\s*Answer\s*:?\s*([A-D])\b\s*:?\s*$/i,
  // may carry the explanation inline after the label
  corrHdr:/^Correct\s*Answer\s*Explanation\s*:?\s*(.*)$/i,
  // seen: "Explanations for Incorrect Options", "Explanations incorrect option:"
  incHdr: /^Explanations?\s*(?:for|of)?\s*(?:the\s*)?incorrect\s*(?:options?|answers?|choices?)\s*:?\s*$/i,
  // letter may be followed by ":" or "." (and occasionally both, e.g. "D. : Incorrect as")
  inc:    /^([A-D])\s*[:.)]?\s*(.*)$/,
  mapped: /^Mapped\s*to\s*:\s*(.+)$/i,
};

// Some questions run option A onto the prompt line, or put every option on ONE
// comma-separated line. Split a line into {lead, options} by locating option markers
// whose letters run in sequence from `expect` — a sequential run cannot occur by accident
// in prose, so this never fires on ordinary text.
function splitOptionRun(line, expect, allowSingle) {
  const LET = ['A', 'B', 'C', 'D'];
  const marks = [];
  const re = /(^|[\s,;(])([A-D])\s*[.)]\s+/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    marks.push({ letter: m[2], at: m.index + (m[1] ? m[1].length : 0), textAt: m.index + m[0].length });
  }
  // keep the longest run starting at `expect` and advancing one letter at a time
  const run = [];
  let want = LET.indexOf(expect);
  for (const mk of marks) {
    if (want < LET.length && mk.letter === LET[want]) { run.push(mk); want++; }
  }
  if (!run.length) return null;
  // Two or more markers is unambiguous. A single marker is only accepted when explicitly
  // allowed (splitting option A off a prompt line) and there is real prompt text before it.
  const lead = line.slice(0, run[0].at).trim();
  if (run.length < 2 && !(allowSingle && lead.length > 10)) return null;
  const opts = run.map((mk, i) => ({
    letter: mk.letter,
    text: line.slice(mk.textAt, i + 1 < run.length ? run[i + 1].at : line.length)
             .trim().replace(/[,;]\s*$/, ''),
  }));
  if (opts.some(o => o.text.length < 3)) return null;
  return { lead, opts };
}

const modules = [];
const warn = [];
let cur = null, block = [];

function parseMapping(text) {
  const m = text.match(/Module\s*(\d+).*?Lesson\s*(\d+).*?Video\s*(\d+)/i);
  return m ? `M${m[1]}L${m[2]}V${m[3]}` : '';
}

function flush() {
  const blk = block.filter(l => l.trim());
  block = [];
  if (!blk.length || !cur) return;
  if (!blk.some(l => RE.key.test(l) || /^Correct\s*Answer/i.test(l))) return;

  const q = { prompt: '', options: [], correct: null, feedback: {}, mapped: '' };
  let mode = 'head', corrBuf = [], lastInc = null;

  for (const line of blk) {
    let m;
    if ((m = line.match(RE.mapped))) { q.mapped = parseMapping(m[1]); q.mappedRaw = m[1].trim(); mode = 'done'; continue; }
    if ((m = line.match(RE.key))) { q.correct = m[1].toUpperCase(); mode = 'corr'; continue; }
    if ((m = line.match(RE.corrHdr))) { if (m[1] && m[1].trim()) corrBuf.push(m[1].trim()); mode = 'corr'; continue; }
    if (RE.incHdr.test(line)) { mode = 'inc'; lastInc = null; continue; }

    if (mode === 'inc') {
      if ((m = line.match(RE.inc)) && (m[2] !== undefined)) {
        const letter = m[1], text = m[2].replace(/^[\s:.)]+/, '').trim();
        // The correct option's entry is a placeholder, not real feedback — skip it so the
        // explanation captured after "Correct Answer: X" is used instead.
        if (isCorrectPlaceholder(text)) { lastInc = null; continue; }
        if (text) { q.feedback[letter] = text; lastInc = letter; continue; }
        lastInc = letter; continue;
      }
      if (lastInc) q.feedback[lastInc] = (q.feedback[lastInc] ? q.feedback[lastInc] + ' ' : '') + line.trim();
      continue;
    }
    if (mode === 'corr') { corrBuf.push(line.trim()); continue; }

    // head: anchor line carries the prompt, then options
    const LET = ['A', 'B', 'C', 'D'];
    const expect = LET[q.options.length] || 'D';

    if (!q.prompt) {
      const am = line.match(RE.anchor);
      let text = am ? am[1].trim() : line.trim();
      // option A may be appended to the prompt line, sometimes with every other option too
      const sp = splitOptionRun(text, 'A', true);
      if (sp) {
        // keep a colon attached to the last word ("...is based on:"); drop only " :"
        if (sp.lead) q.prompt = sp.lead.replace(/\s+:\s*$/, '').trim();
        q.options.push(...sp.opts);
        continue;
      }
      if (text) { q.prompt = text; continue; }
      continue;
    }

    const sp = splitOptionRun(line, expect);
    if (sp) {
      if (sp.lead && !q.options.length) q.prompt += ' ' + sp.lead;
      q.options.push(...sp.opts);
      continue;
    }
    if ((m = line.match(RE.opt))) { q.options.push({ letter: m[1], text: m[2].trim() }); continue; }
    if (q.options.length) {
      q.options[q.options.length - 1].text += ' ' + line.trim();
    } else {
      q.prompt += ' ' + line.trim();
    }
  }

  // A stray " :" trails some prompts that already end in "?". A colon attached to the last
  // word ("...is based on:") is intentional and is left alone.
  q.prompt = q.prompt.replace(/\s+:\s*$/, '').trim();

  const corrText = corrBuf.filter(t => !isCorrectPlaceholder(t)).join(' ').trim();
  if (q.correct && corrText) q.feedback[q.correct] = corrText;

  q.num = cur.questions.length + 1;
  cur.questions.push(q);

  const id = `M${cur.num} Q${q.num}`;
  if (!q.prompt) warn.push(`${id}: no prompt`);
  if (q.options.length !== 4) warn.push(`${id}: ${q.options.length} options`);
  if (!q.correct) warn.push(`${id}: no correct answer`);
  if (!q.mapped) warn.push(`${id}: mapping unparsed${q.mappedRaw ? ' from "' + q.mappedRaw.slice(0, 60) + '"' : ''}`);
  const miss = q.options.map(o => o.letter).filter(L => !q.feedback[L]);
  if (miss.length) warn.push(`${id}: no feedback for ${miss.join(',')}`);
  const ph = Object.entries(q.feedback).filter(([, v]) => isCorrectPlaceholder(v) || /^correct answer$/i.test(v));
  if (ph.length) warn.push(`${id}: placeholder text left in feedback ${ph.map(x => x[0]).join(',')}`);
}

for (const line of src) {
  const t = (line || '').trim();
  const mm = t.match(/^Module\s+(\d+)\s*$/i);
  if (mm) { flush(); cur = { num: +mm[1], title: '', questions: [] }; modules.push(cur); continue; }
  if (isSep(t)) { flush(); continue; }
  block.push(line);
}
flush();

if (process.argv[2] === '--report') {
  modules.forEach(mo => console.log(`Module ${mo.num}: ${mo.questions.length} questions`));
  console.log('\nwarnings: ' + warn.length);
  warn.forEach(w => console.log('  ' + w));
} else {
  modules.forEach(mo => mo.questions.forEach(q => delete q.mappedRaw));
  console.log(JSON.stringify(modules, null, 2));
}
