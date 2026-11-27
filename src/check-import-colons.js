// EVERY COLON RULE THIS IMPORTER HAS TAUGHT US, checked and repaired on the built document.
//
//     node src/check-import-colons.js <dir|file> ...          report, exit 1 if any
//     node src/check-import-colons.js --fix <dir|file> ...     repair in place
//
// Two rules, both learned the hard way, both producing the same useless error from Coursera —
// "Content couldn't be processed", naming no question and no line.
//
//   1. A REFERENCE MAY CARRY ONE COLON. The colon after the asset kind introduces the title;
//      a colon inside the title makes a second. Found 2026-11-27 on GenAIOps Course 3, whose
//      graded quizzes failed for days while its practice quizzes imported — the difference was
//      question 7 citing "Reading: Summary and Highlights: Drift Detection for Data, Model…".
//      55 of 611 delivered documents across 15 courses carried one.
//
//   2. A PROMPT OR FEEDBACK MUST NOT OPEN ON A LABEL. SETUP §7 records that Coursera reads a
//      leading "Word:" as an ANSWER OPTION and rejects the question with a generic format
//      error. The rule was written for prompts; a feedback body sits in the same position and
//      is read the same way — the final exam of the same course carried
//      "Feedback: Recheck the total budget: apply the allowed failure percentage…".
//
// In both cases only PUNCTUATION changes: the offending colon becomes an en dash. No word is
// added, removed or reordered, and the sentence reads as its author wrote it.
//
// Run on the built artefact, not the source, because courses assemble their text in at least
// three different ways and a rule applied in one library leaves the others exposed. Run it on
// `work/<slug>/dist` before delivering, and on `output/` to audit what has already gone out.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { zipDir } = require('./lib-zipwriter');

const PARA = /<w:p\b(?:(?!<w:p\b)[\s\S])*?<\/w:p>|<w:p\b[^>]*\/>/g;
const textOf = p => [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const IS_REF = /^Refer to\s/i;
const IS_FEEDBACK = /^(Feedback\s*[:–-]\s*)/i;
const IS_OPTION = /^\*?[A-F]\s*[:.]\s+\S/;
const IS_QHEAD = /^(?:Question\s+\d+|Q\d+)\b/i;
// Short enough to be mistaken for a label, long enough to be a real phrase.
const LABEL = /^([A-Za-z][A-Za-z ]{0,30}):\s/;

// Rule 1: within "Refer to A; B; C", each of A, B, C keeps its first colon only.
function fixReference(line) {
  const m = /^(Refer to\s+)([\s\S]*)$/i.exec(line);
  if (!m) return line;
  return m[1] + m[2].split(/;\s*/).map(ref => {
    const i = ref.indexOf(':');
    return i < 0 ? ref : ref.slice(0, i + 1) + ref.slice(i + 1).replace(/\s*:\s*/g, ' – ');
  }).join('; ');
}

// Rule 2: a prompt or feedback body must not open "Word:".
function fixLabel(line) {
  const fb = IS_FEEDBACK.exec(line);
  const head = fb ? fb[1] : '';
  const body = fb ? line.slice(head.length) : line;
  const m = LABEL.exec(body);
  if (!m) return line;
  return head + body.replace(LABEL, `${m[1]} – `);
}

function offends(line) {
  const t = line.trim();
  if (!t) return null;
  if (IS_QHEAD.test(t) || IS_OPTION.test(t)) return null;
  if (IS_REF.test(t)) {
    const over = t.replace(/^Refer to\s+/i, '').split(/;\s*/)
      .filter(r => (r.match(/:/g) || []).length > 1);
    return over.length ? 'reference with a second colon' : null;
  }
  const fb = IS_FEEDBACK.exec(t);
  const body = fb ? t.slice(fb[1].length) : t;
  return LABEL.test(body) ? (fb ? 'feedback opening on a label' : 'prompt opening on a label') : null;
}

const repair = line => (IS_REF.test(line.trim()) ? fixReference(line.trim()) : fixLabel(line.trim()));

const args = process.argv.slice(2);
const doFix = args.includes('--fix');
const targets = args.filter(a => a !== '--fix');
if (!targets.length) {
  console.error('usage: node src/check-import-colons.js [--fix] <dir|file> ...');
  process.exit(2);
}

function docxFiles(t) {
  const st = fs.statSync(t);
  if (st.isFile()) return t.endsWith('.docx') ? [t] : [];
  const out = [];
  for (const e of fs.readdirSync(t, { withFileTypes: true })) {
    const p = path.join(t, e.name);
    if (e.isDirectory()) out.push(...docxFiles(p));
    else if (e.name.endsWith('.docx')) out.push(p);
  }
  return out.sort();
}

const work = path.join(require('os').tmpdir(), 'check-import-colons');
let scanned = 0, bad = 0, repaired = 0;
const tally = {};
for (const t of targets) {
  for (const file of docxFiles(t)) {
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    try {
      execFileSync('unzip', ['-o', '-q', file, '-d', work]);
      const docPath = path.join(work, 'word', 'document.xml');
      let xml = fs.readFileSync(docPath, 'utf8');
      const paras = xml.match(PARA) || [];
      const si = paras.findIndex(p => /Importable content starts here/i.test(textOf(p)));
      const ei = paras.findIndex(p => /End of importable content|Importable content ends here/i.test(textOf(p)));
      if (si < 0 || ei < 0) continue;
      scanned++;

      const hits = [];
      for (const p of paras.slice(si + 1, ei)) {
        const why = offends(textOf(p));
        if (why) hits.push({ p, why, text: textOf(p).trim() });
      }
      if (!hits.length) continue;
      bad++;
      for (const h of hits) tally[h.why] = (tally[h.why] || 0) + 1;

      if (!doFix) {
        console.log(`  !!  ${path.basename(file)}`);
        for (const h of [...new Map(hits.map(x => [x.text, x])).values()].slice(0, 2)) {
          console.log(`        ${h.why}: ${h.text.slice(0, 96)}`);
        }
        continue;
      }
      for (const p of [...new Set(hits.map(h => h.p))]) {
        const runs = p.match(/<w:r\b(?:(?!<w:r\b)[\s\S])*?<\/w:r>/g) || [];
        if (!runs.length) continue;
        const first = runs[0].replace(/(<w:t[^>]*>)[\s\S]*?(<\/w:t>)/, `$1${esc(repair(textOf(p)))}$2`);
        let np = p.replace(runs[0], '\u0000F\u0000');
        for (const r of runs.slice(1)) np = np.replace(r, '');
        np = np.replace('\u0000F\u0000', first);
        xml = xml.split(p).join(np);   // identical paragraphs repeat across a question's options
      }
      fs.writeFileSync(docPath, xml, 'utf8');
      fs.rmSync(file, { force: true });
      zipDir(work, file);
      repaired++;
      console.log(`  fixed  ${path.basename(file)}`);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }
}
fs.rmSync(work, { recursive: true, force: true });
console.log(`\n${scanned} document(s) scanned · ${doFix ? `${repaired} repaired` : `${bad} with a colon fault`}`);
for (const [k, n] of Object.entries(tally)) console.log(`    ${n} × ${k}`);
process.exit(!doFix && bad ? 1 : 0);
