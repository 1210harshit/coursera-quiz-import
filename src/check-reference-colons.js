// ONE COLON PER REFERENCE. Checks — and with --fix repairs — every "Refer to" line in a built
// document, so no course can ship a reference carrying a second colon.
//
//     node src/check-reference-colons.js <dir|file> ...          report, exit 1 if any
//     node src/check-reference-colons.js --fix <dir|file> ...     repair in place
//
// WHY. Coursera refuses a document whose reference line contains a second colon, with
// "Content couldn't be processed" — a file-level error that names nothing and gives no clue
// which line is at fault. It cost most of a week to find, because every other property of the
// refused documents matched one that imported: same package, same Guide Section, same
// paragraph properties, same grammar, same characters.
//
// It surfaced as "graded quizzes fail, practice quizzes import" on GenAIOps Course 3, which
// looked like a length limit — ten questions against five — until the real cause turned up in
// question 7, a question only the longer documents reach:
//
//     Module 2 Lesson 3 Reading: Summary and Highlights: Drift Detection for Data, Model, …
//
// The colon after the asset kind introduces the title. A colon inside the TITLE makes a
// second one, and that is what breaks it. Such titles are ordinary — "Bloom's Taxonomy:
// Theory", "Build, Buy, or Partner: Making the Right Growth Decision", "FAQ: When Drift
// Detection Fires but the Cause Is Upstream" — so this is not a rare shape: 55 of 611
// delivered documents across 15 courses carried one when the rule was found.
//
// THE FIX IS PUNCTUATION ONLY. The second and later colons become en dashes. No word is added
// or removed and the title still reads as its author wrote it.
//
// This runs on the FINISHED document on purpose. Fourteen course libraries now apply the same
// rule at build time, but eight of the affected courses assemble their references elsewhere,
// so a build-time fix alone would leave them exposed. A check on the artefact covers every
// course whatever produced it — run it before any delivery.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { zipDir } = require('./lib-zipwriter');

const PARA = /<w:p\b(?:(?!<w:p\b)[\s\S])*?<\/w:p>|<w:p\b[^>]*\/>/g;
const textOf = p => [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// "Refer to A; B; C" -> each of A, B, C keeps its first colon and loses any later one.
function repair(line) {
  const m = /^(Refer to\s+)([\s\S]*)$/i.exec(line);
  if (!m) return line;
  const fixed = m[2].split(/;\s*/).map(ref => {
    const i = ref.indexOf(':');
    if (i < 0) return ref;
    return ref.slice(0, i + 1) + ref.slice(i + 1).replace(/\s*:\s*/g, ' – ');
  }).join('; ');
  return m[1] + fixed;
}

const args = process.argv.slice(2);
const doFix = args.includes('--fix');
const targets = args.filter(a => a !== '--fix');
if (!targets.length) {
  console.error('usage: node src/check-reference-colons.js [--fix] <dir|file> ...');
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

const work = path.join(require('os').tmpdir(), 'check-reference-colons');
let scanned = 0, bad = 0, fixedFiles = 0;
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

      const offenders = [];
      for (const p of paras.slice(si + 1, ei)) {
        const t0 = textOf(p).trim();
        if (!/^Refer to\s/i.test(t0)) continue;
        const over = t0.replace(/^Refer to\s+/i, '').split(/;\s*/)
          .filter(r => (r.match(/:/g) || []).length > 1);
        if (over.length) offenders.push({ para: p, text: t0 });
      }
      if (!offenders.length) continue;
      bad++;
      if (!doFix) {
        console.log(`  !!  ${path.basename(file)}`);
        console.log(`        ${[...new Set(offenders.map(o => o.text))][0].slice(0, 110)}`);
        continue;
      }
      // Rewrite each offending paragraph's text, keeping its first run's formatting.
      for (const o of [...new Set(offenders.map(x => x.para))]) {
        const runs = o.match(/<w:r\b(?:(?!<w:r\b)[\s\S])*?<\/w:r>/g) || [];
        if (!runs.length) continue;
        const first = runs[0].replace(/(<w:t[^>]*>)[\s\S]*?(<\/w:t>)/, `$1${esc(repair(textOf(o).trim()))}$2`);
        let np = o.replace(runs[0], '\u0000F\u0000');
        for (const r of runs.slice(1)) np = np.replace(r, '');
        np = np.replace('\u0000F\u0000', first);
        // split/join, not replace: the four options of a question usually carry the SAME
        // reference paragraph, and String.replace with a string pattern rewrites only the
        // first of them — which left three of every four untouched and the check still failing.
        xml = xml.split(o).join(np);
      }
      fs.writeFileSync(docPath, xml, 'utf8');
      fs.rmSync(file, { force: true });
      zipDir(work, file);
      fixedFiles++;
      console.log(`  fixed  ${path.basename(file)}`);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }
}
fs.rmSync(work, { recursive: true, force: true });
console.log(`\n${scanned} document(s) scanned · ${doFix ? `${fixedFiles} repaired` : `${bad} carrying a second colon`}`);
process.exit(!doFix && bad ? 1 : 0);
