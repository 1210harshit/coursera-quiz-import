// DIAGNOSTIC, not production. Builds TWO documents that swap the question section between a
// Cybersecurity Course 1 file that imports and the Cybersecurity Course 3 file that does not,
// so one upload each says whether the fault is in the CONTENT or in the SHELL.
//
//     node src/cyber-course-3-swap-probe.js [outDir]
//
// WHY. Course 3's M1L2 practice quiz is refused with "Content couldn't be processed" — a
// FILE-level message naming no question. Everything comparable has been compared and matches
// the Course 1 set that imports: the zip container (20 entries, same order, same compression),
// every package part byte-for-byte except word/document.xml, the Guide Section (13 lines, no
// tables, 3 hyperlinks), every relationship reference, and all 182 questions against a strict
// per-question check. Inspection has nothing left to offer, and each guess costs an upload.
//
// A swap costs two, and cannot come back ambiguous:
//
//   SHELL_C1  Course 1's document with Course 3's questions dropped in
//   SHELL_C3  Course 3's document with Course 1's questions dropped in
//
//   SHELL_C1 fails, SHELL_C3 imports  -> the fault is in Course 3's QUESTION CONTENT
//   SHELL_C1 imports, SHELL_C3 fails  -> the fault is in Course 3's DOCUMENT SHELL
//   both import                       -> neither alone is sufficient; it is an interaction,
//                                        or the refused upload was not of the file we think
//   both fail                         -> the fault is in neither half as transplanted, which
//                                        points at the upload step rather than the documents
//
// Nothing here is delivered. Both files carry a GUIDE-SECTION warning saying so, because a
// transplanted document has the wrong course name in its heading and must never be mistaken
// for a deliverable.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { zipDir } = require('./lib-zipwriter');

const OUT = process.argv[2] || path.join(__dirname, '..', 'work', 'cyber-course-3', 'probe');
const REPO = path.join(__dirname, '..');
const C1 = path.join(REPO, 'work', 'cyber-course-1', 'dist',
  'Coursera_Import_Module_1_Lesson_2_Practice_Quiz_Cybersecurity_Course_1.docx');
const C3 = path.join(REPO, 'work', 'cyber-course-3', 'dist',
  'Coursera_Import_Module_1_Lesson_2_Practice_Quiz_Cybersecurity_Course_3.docx');
for (const f of [C1, C3]) {
  if (!fs.existsSync(f)) { console.error('ENOENT ' + f); process.exit(1); }
}

const PARA = /<w:p\b(?:(?!<w:p\b)[\s\S])*?<\/w:p>|<w:p\b[^>]*\/>/g;
const textOf = p => [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('');

function open(file, tag) {
  const dir = path.join(OUT, '_' + tag);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('unzip', ['-o', '-q', file, '-d', dir]);
  const docPath = path.join(dir, 'word', 'document.xml');
  const xml = fs.readFileSync(docPath, 'utf8');
  const paras = xml.match(PARA) || [];
  const si = paras.findIndex(p => /Importable content starts here/i.test(textOf(p)));
  const ei = paras.findIndex(p => /End of importable content|Importable content ends here/i.test(textOf(p)));
  if (si < 0 || ei < 0) { console.error('no importable markers in ' + file); process.exit(1); }
  return { dir, docPath, xml, paras, si, ei };
}

// Put `donor`'s question paragraphs inside `host`, between host's own markers. The markers
// themselves stay the host's, so the document still says what it always said around them.
function transplant(host, donor, outName, note) {
  const body = donor.paras.slice(donor.si + 1, donor.ei).join('');
  const first = host.paras[0];
  const last = host.paras[host.paras.length - 1];
  const before = host.xml.slice(0, host.xml.indexOf(first));
  const after = host.xml.slice(host.xml.lastIndexOf(last) + last.length);
  // A loud note at the very top, so neither file can be mistaken for something to deliver.
  const warn = host.paras[0].replace(/(<w:t[^>]*>)[\s\S]*?(<\/w:t>)/,
    `$1${note.replace(/&/g, '&amp;').replace(/</g, '&lt;')}$2`);
  const out = before + warn + host.paras.slice(1, host.si + 1).join('')
    + body + host.paras.slice(host.ei).join('') + after;
  fs.writeFileSync(host.docPath, out, 'utf8');
  const file = path.join(OUT, outName);
  zipDir(host.dir, file);
  fs.rmSync(host.dir, { recursive: true, force: true });
  const n = (body.match(/<w:t[^>]*>Question \d+/g) || []).length;
  console.log(`WROTE  ${outName}`);
  return n;
}

fs.mkdirSync(OUT, { recursive: true });
const a = transplant(open(C1, 'a'), open(C3, 'b'),
  'SWAP_A_course1_shell_with_course3_questions.docx',
  'DIAGNOSTIC ONLY — DO NOT PUBLISH. Course 1 document shell carrying Course 3 M1L2 questions.');
const b = transplant(open(C3, 'c'), open(C1, 'd'),
  'SWAP_B_course3_shell_with_course1_questions.docx',
  'DIAGNOSTIC ONLY — DO NOT PUBLISH. Course 3 document shell carrying Course 1 M1L2 questions.');

console.log('');
console.log(`  SWAP_A  Course 1 shell + Course 3 questions`);
console.log(`  SWAP_B  Course 3 shell + Course 1 questions`);
console.log('');
console.log('  A fails, B imports  ->  the fault is in Course 3\'s question content');
console.log('  A imports, B fails  ->  the fault is in Course 3\'s document shell');
console.log('  both import         ->  neither half alone does it');
console.log('  both fail           ->  the fault is not in the documents');
console.log('');
console.log(`  (${OUT})`);
