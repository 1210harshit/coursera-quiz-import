// Splits a built quiz into parts of at most N questions each, so a long quiz can be imported
// as two uploads into the SAME Coursera quiz item.
//
//     node src/split-long-quiz.js <dir|file> [--max 5] [--out <dir>]
//
// WHY. From 2026-11-25 Coursera refused every ten-question document the course owner tried —
// graded quizzes and final exams — with "Content couldn't be processed", while every
// five-question practice quiz imported. The documents were matched to a working one property
// by property first: identical package, identical Guide Section (19 blocks, zero differences),
// identical paragraph properties role by role, identical run structure, same character
// repertoire. Length is the only thing that separates the two groups.
//
// Splitting is a workaround, not a diagnosis. It is here because it preserves every question
// and needs nothing from Coursera: importing part 1 and then part 2 into one quiz item appends
// the second set to the first, giving the full quiz. If the real limit turns out to be higher
// than five, raise --max; if length turns out not to be the cause at all, delete this file.
//
// QUESTIONS ARE RENUMBERED FROM 1 IN EVERY PART, because the import grammar numbers questions
// within a document and part 2 starting at "Question 6" would be read as a document whose
// numbering does not start at one. Nothing else is touched: the Guide Section, the settings
// table, the package and each question's own text and options are exactly as built.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { zipDir } = require('./lib-zipwriter');

const args = process.argv.slice(2);
const maxAt = args.indexOf('--max');
const MAX = maxAt >= 0 ? Number(args[maxAt + 1]) : 5;
const outAt = args.indexOf('--out');
const OUTDIR = outAt >= 0 ? args[outAt + 1] : null;
const targets = args.filter((a, i) =>
  !a.startsWith('--') && i !== maxAt + 1 && i !== outAt + 1);
if (!targets.length) {
  console.error('usage: node src/split-long-quiz.js <dir|file> [--max 5] [--out <dir>]');
  process.exit(2);
}

const BLOCK = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b(?:(?!<w:p\b)[\s\S])*?<\/w:p>|<w:p\b[^>]*\/>/g;
const textOf = s => [...s.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('');
const isQ = b => /^Question\s+\d+\s*[-–—]/i.test(textOf(b).trim());

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

const work = path.join(require('os').tmpdir(), 'split-long-quiz');
let split = 0, left = 0;
for (const target of targets) {
  for (const file of docxFiles(target)) {
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    execFileSync('unzip', ['-o', '-q', file, '-d', work]);
    const docPath = path.join(work, 'word', 'document.xml');
    const xml = fs.readFileSync(docPath, 'utf8');
    const blocks = xml.match(BLOCK) || [];
    const si = blocks.findIndex(b => /Importable content starts here/i.test(textOf(b)));
    const ei = blocks.findIndex(b => /End of importable content|Importable content ends here/i.test(textOf(b)));
    if (si < 0 || ei < 0) { console.log(`  --  ${path.basename(file)} (no section)`); continue; }

    // Group the section into one run of blocks per question.
    const body = blocks.slice(si + 1, ei);
    const groups = [];
    for (const b of body) {
      if (isQ(b)) groups.push([b]);
      else if (groups.length) groups[groups.length - 1].push(b);
      // blocks before the first question header are kept with the head, below
    }
    const lead = body.slice(0, body.findIndex(isQ) < 0 ? body.length : body.findIndex(isQ));
    if (groups.length <= MAX) { left++; continue; }

    const parts = [];
    for (let i = 0; i < groups.length; i += MAX) parts.push(groups.slice(i, i + MAX));
    const dir = OUTDIR || path.dirname(file);
    fs.mkdirSync(dir, { recursive: true });
    const base = path.basename(file, '.docx');

    parts.forEach((part, pi) => {
      let n = 0;
      const rendered = part.map(g => g.map(b => {
        if (!isQ(b)) return b;
        n++;
        // Renumber only the leading "Question <d>" of the header run's text.
        return b.replace(/(<w:t[^>]*>)(\s*Question\s+)\d+/i, `$1$2${n}`);
      }).join('')).join('');
      const out = xml.slice(0, xml.indexOf(blocks[0]))
        + blocks.slice(0, si + 1).join('')
        + lead.join('') + rendered
        + blocks.slice(ei).join('')
        + xml.slice(xml.lastIndexOf(blocks[blocks.length - 1]) + blocks[blocks.length - 1].length);
      fs.writeFileSync(docPath, out, 'utf8');
      const name = `${base}_Part_${pi + 1}_of_${parts.length}.docx`;
      const dest = path.join(dir, name);
      fs.rmSync(dest, { force: true });
      zipDir(work, dest);
      console.log(`  ${name}  (${part.length} questions)`);
    });
    split++;
  }
}
fs.rmSync(work, { recursive: true, force: true });
console.log(`\n${split} quiz(zes) split at ${MAX} questions · ${left} already within the limit`);
