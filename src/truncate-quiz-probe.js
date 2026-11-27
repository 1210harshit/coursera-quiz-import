// DIAGNOSTIC, not production. Writes a copy of a built quiz keeping only the first N
// questions, so question COUNT can be tested independently of everything else in the file.
//
//     node src/truncate-quiz-probe.js <built.docx> <N> <out.docx>
//
// WHY. Every document the course owner has confirmed importing is a FIVE-question practice
// quiz; every one reported as "Content couldn't be processed" is a TEN-question graded quiz or
// final exam. In this corpus those two facts are confounded — every practice quiz has five
// questions and every graded quiz has ten — so the pattern alone cannot say whether the
// importer is objecting to the length or to something about how graded documents are built.
//
// Cutting a graded quiz down to five questions separates them, because it changes the count
// while leaving everything else exactly as it is: same Guide Section, same settings table,
// same package, same paragraph properties, same first five questions byte for byte.
//
//   it imports      -> the length (or something that scales with it) is the problem
//   it still fails  -> the length is NOT the problem, and the difference is elsewhere in how
//                      graded documents differ from practice ones
//
// The traceability table after the end marker is left alone deliberately: it is outside the
// imported region, and trimming it too would change two things at once.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { zipDir } = require('./lib-zipwriter');

const [src, nRaw, out] = process.argv.slice(2);
if (!src || !nRaw || !out) {
  console.error('usage: node src/truncate-quiz-probe.js <built.docx> <N> <out.docx>');
  process.exit(2);
}
const keep = Number(nRaw);

const PARA = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b(?:(?!<w:p\b)[\s\S])*?<\/w:p>|<w:p\b[^>]*\/>/g;
const textOf = s => [...s.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('');

const work = path.join(require('os').tmpdir(), 'truncate-quiz-probe');
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
execFileSync('unzip', ['-o', '-q', src, '-d', work]);
const docPath = path.join(work, 'word', 'document.xml');
const xml = fs.readFileSync(docPath, 'utf8');

const blocks = xml.match(PARA) || [];
const si = blocks.findIndex(b => /Importable content starts here/i.test(textOf(b)));
const ei = blocks.findIndex(b => /End of importable content|Importable content ends here/i.test(textOf(b)));
if (si < 0 || ei < 0) { console.error('no importable section'); process.exit(1); }

const isQ = b => /^Question\s+\d+\s*[-–—]/i.test(textOf(b).trim());
const body = blocks.slice(si + 1, ei);
let seen = 0;
const kept = [];
for (const b of body) {
  if (isQ(b)) { seen++; if (seen > keep) break; }
  kept.push(b);
}
if (seen <= keep) {
  console.error(`the document has only ${seen} question(s); nothing to cut`);
  process.exit(1);
}

const first = blocks[0];
const last = blocks[blocks.length - 1];
const rebuilt = xml.slice(0, xml.indexOf(first))
  + blocks.slice(0, si + 1).join('')
  + kept.join('')
  + blocks.slice(ei).join('')
  + xml.slice(xml.lastIndexOf(last) + last.length);

fs.writeFileSync(docPath, rebuilt, 'utf8');
fs.rmSync(out, { force: true });
zipDir(work, out);
fs.rmSync(work, { recursive: true, force: true });
console.log(`WROTE  ${path.basename(out)}  —  ${keep} of ${seen} questions kept, everything else untouched`);
