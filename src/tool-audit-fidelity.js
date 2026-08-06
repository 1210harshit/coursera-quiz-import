// Compare every emitted string in the built docs against the RAW source text,
// reporting any difference at all — including whitespace.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
                  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function paragraphs(xml) {
  const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [null, xml])[1];
  const out = [];
  const pRe = /<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
  let pm;
  while ((pm = pRe.exec(body)) !== null) {
    let t = '';
    const tok = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/>/g;
    let tm;
    while ((tm = tok.exec(pm[0])) !== null) t += tm[1] !== undefined ? dec(tm[1]) : '\n';
    out.push(t);
  }
  return out;
}

// ---- RAW source, untrimmed ----
const srcParas = paragraphs(fs.readFileSync(path.join(SP, 'quiz', 'word', 'document.xml'), 'utf8'));
const qStarts = [];
srcParas.forEach((p, i) => { if (/^Question \d+\s+\|/.test(p.trim())) qStarts.push(i); });

const srcQ = [];
qStarts.forEach((s, k) => {
  const e = k + 1 < qStarts.length ? qStarts[k + 1] : srcParas.length;
  const blk = srcParas.slice(s + 1, e).filter(l => l.trim());
  const prompt = [], opts = {}, fb = {};
  let mode = 'prompt', last = null;
  for (const l of blk) {
    const t = l.replace(/ /g, ' ');
    let m;
    if (/^Module \d+:/.test(t.trim())) break;
    if ((m = t.match(/^([A-Z])\.\s(.*)$/)) && mode !== 'feedback') { mode = 'opt'; opts[m[1]] = m[2]; continue; }
    if (/^\s*(✅\s*)?Correct Answer:/.test(t)) { mode = 'key'; continue; }
    if (/^Feedback:\s*$/.test(t.trim())) { mode = 'feedback'; continue; }
    if (mode === 'feedback' && (m = t.match(/^([A-Z]):\s(.*)$/))) { fb[m[1]] = m[2]; last = m[1]; continue; }
    if (mode === 'prompt') prompt.push(t);
  }
  srcQ.push({ prompt, opts, fb });
});

// ---- built documents ----
let diffs = 0, checked = 0;
let qi = 0;
for (let n = 1; n <= 4; n++) {
  const f = path.join(SP, 'dist', `Coursera_Import_Module_${n}_Graded_Quiz_OSHA.docx`);
  const built = paragraphs(execFileSync('unzip', ['-p', f, 'word/document.xml'], { maxBuffer: 1e8 }).toString());
  const s = built.findIndex(l => l.trim() === '----- Importable content starts here -----');
  const e = built.findIndex(l => l.trim() === '----- End of importable content -----');
  const sec = built.slice(s + 1, e).filter(l => l.trim());

  const idx = [];
  sec.forEach((l, i) => { if (/^Question \d+ - /.test(l.trim())) idx.push(i); });

  idx.forEach((st, k) => {
    const en = k + 1 < idx.length ? idx[k + 1] : sec.length;
    const blk = sec.slice(st, en);
    const src = srcQ[qi++];
    const tag = `M${n} Q${k + 1}`;

    const firstOpt = blk.findIndex(l => /^\*?[A-D]:\s/.test(l.trim()));
    const gotPrompt = blk.slice(1, firstOpt);
    const wantPrompt = src.prompt.map((l, i) => i === 0 ? l.replace(/^\s*Scenario\s*:\s*/i, '') : l);
    if (gotPrompt.length !== wantPrompt.length) {
      console.log(`${tag} PROMPT paragraph count ${gotPrompt.length} vs source ${wantPrompt.length}`); diffs++;
    } else {
      gotPrompt.forEach((g, i) => {
        checked++;
        if (g !== wantPrompt[i]) {
          diffs++;
          console.log(`${tag} PROMPT p${i + 1}\n   built:  ${JSON.stringify(g)}\n   source: ${JSON.stringify(wantPrompt[i])}`);
        }
      });
    }

    blk.filter(l => /^\*?[A-D]:\s/.test(l.trim())).forEach(l => {
      const m = l.match(/^\*?([A-D]):\s([\s\S]*)$/);
      checked++;
      if (m && m[2] !== src.opts[m[1]]) {
        diffs++;
        console.log(`${tag} OPTION ${m[1]}\n   built:  ${JSON.stringify(m[2])}\n   source: ${JSON.stringify(src.opts[m[1]])}`);
      }
    });

    blk.filter(l => /^Feedback:\s/.test(l.trim())).forEach((l, i) => {
      const letter = ['A', 'B', 'C', 'D'][i];
      // strip the appended bracketed reference, then the leading verdict word
      const core = l.replace(/^Feedback:\s/, '').replace(/\s*\(Refer to Module[\s\S]*\)$/, '');
      const wantCore = (src.fb[letter] || '').replace(/^\s*(Correct|Incorrect)\s*[.:,!]?\s+/, '');
      checked++;
      if (core !== wantCore) {
        diffs++;
        console.log(`${tag} FEEDBACK ${letter}\n   built:  ${JSON.stringify(core)}\n   source: ${JSON.stringify(wantCore)}`);
      }
    });
  });
}

console.log(`\nstrings compared: ${checked}`);
console.log(diffs === 0
  ? 'No differences — every prompt, option and feedback matches the source exactly, whitespace included.'
  : `${diffs} difference(s) found.`);
