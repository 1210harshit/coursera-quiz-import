const fs = require('fs');

const xml = fs.readFileSync(process.argv[2], 'utf8');
const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
                  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

// --- extract plain paragraphs ---
const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [null, xml])[1];
const paras = [];
const fmts = [];    // parallel: {b,i} formatting of the paragraph's body runs
const pRe = /<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
let pm;
while ((pm = pRe.exec(body)) !== null) {
  let t = '';
  const runs = [];
  const runRe = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
  let rm;
  while ((rm = runRe.exec(pm[0])) !== null) {
    const r = rm[1];
    let rt = '';
    const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let tm;
    while ((tm = tRe.exec(r)) !== null) rt += dec(tm[1]);
    if (!rt) continue;
    runs.push({
      t: rt,
      b: /<w:b\/>|<w:b w:val="(1|true|on)"/.test(r),
      i: /<w:i\/>|<w:i w:val="(1|true|on)"/.test(r),
    });
    t += rt;
  }
  paras.push(t.replace(/\u00a0/g, ' ').trim());
  // Formatting of the paragraph excluding a leading "Scenario:"-style label run,
  // so the label's own styling doesn't misrepresent the body text.
  const bodyRuns = runs.filter(r => !/^\s*Scenario\s*:\s*$/i.test(r.t));
  const src = bodyRuns.length ? bodyRuns : runs;
  fmts.push({
    b: src.length > 0 && src.every(r => r.b),
    i: src.length > 0 && src.every(r => r.i),
  });
}

const modules = [];
let cur = null, q = null;

function pushQ() {
  if (cur && q) cur.questions.push(q);
  q = null;
}

for (let i = 0; i < paras.length; i++) {
  const line = paras[i];
  if (!line) continue;

  let m;
  if ((m = line.match(/^Module\s+(\d+)\s*:\s*(.+)$/))) {
    pushQ();
    cur = { num: +m[1], title: m[2].trim(), questions: [] };
    modules.push(cur);
    continue;
  }
  if (!cur) continue;

  if ((m = line.match(/^Question\s+(\d+)\b(.*)$/))) {
    pushQ();
    const meta = m[2] || '';
    const mapped = (meta.match(/Mapped to:\s*([^|]+)/) || [])[1];
    const bloom = (meta.match(/Bloom's:\s*([^|]+)/) || [])[1];
    const type = (meta.match(/Type:\s*([^|]+)/) || [])[1];
    q = {
      num: +m[1],
      mapped: mapped ? mapped.trim() : '',
      bloom: bloom ? bloom.trim() : '',
      type: type ? type.trim() : '',
      prompt: [], promptFmt: [], options: [], correct: null, feedback: {},
      _mode: 'prompt'
    };
    continue;
  }
  if (!q) continue;

  // Option line: "A. text"
  if ((m = line.match(/^([A-Z])\.\s+(.*)$/)) && q._mode !== 'feedback') {
    q._mode = 'options';
    q.options.push({ letter: m[1], text: m[2].trim() });
    continue;
  }
  // Correct answer marker
  if ((m = line.match(/^\s*(?:✅\s*)?Correct Answer:\s*([A-Z])\s*$/))) {
    q.correct = m[1];
    q._mode = 'await-feedback';
    continue;
  }
  // "Feedback:" header
  if (/^Feedback:\s*$/.test(line)) { q._mode = 'feedback'; continue; }
  // Feedback body: "A: text"
  if (q._mode === 'feedback' && (m = line.match(/^([A-Z]):\s*(.*)$/))) {
    q.feedback[m[1]] = m[2].trim();
    q._lastFb = m[1];
    continue;
  }
  if (q._mode === 'feedback' && q._lastFb) {
    q.feedback[q._lastFb] += ' ' + line;
    continue;
  }
  if (q._mode === 'prompt') { q.prompt.push(line); q.promptFmt.push(fmts[i]); continue; }
}
pushQ();

modules.forEach(mo => mo.questions.forEach(qq => { delete qq._mode; delete qq._lastFb; }));
console.log(JSON.stringify(modules, null, 2));
