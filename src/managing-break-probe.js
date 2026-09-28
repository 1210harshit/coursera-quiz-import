// DIAGNOSTIC, not production. Builds ONE Module 1 document in which each question encodes the
// explanation/reference break DIFFERENTLY, so a single upload identifies which encoding
// Coursera renders as one row break.
//
// Why this exists: the file has been correct twice. One <w:p>, one <w:br/>, verified in the
// XML both times — first as three runs, then collapsed to one — and Coursera rendered two row
// breaks on both. So the doubling happens inside the importer, and guessing at its rules one
// build at a time costs an upload per guess. This costs one upload total.
//
//   node src/managing-break-probe.js [srcDir] [outDir]
//
// Every feedback line is prefixed [E<n>] naming its encoding. Upload the result, then read off
// which [E<n>] shows a single break. Answer keys and explanations are otherwise untouched.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { zipDir } = require('./lib-zipwriter');

const SRC = process.argv[2] || path.join(__dirname, '..', 'work', 'managing', 'dist');
const OUT = process.argv[3] || path.join(__dirname, '..', 'work', 'managing', 'probe');
const RPR = '<w:rPr><w:rFonts w:ascii="Source Sans Pro" w:cs="Source Sans Pro" '
          + 'w:eastAsia="Source Sans Pro" w:hAnsi="Source Sans Pro"/><w:rtl w:val="0"/></w:rPr>';
const T = s => `<w:t xml:space="preserve">${s}</w:t>`;
const NL = String.fromCharCode(10);
// Zero space above the paragraph, so a separate <w:p> renders tight against the line above
// rather than with the document's default gap.
const TIGHT = '<w:spacing w:after="0" w:before="0" w:line="240" w:lineRule="auto"/>';
//
// Word's own soft line break character, the vertical tab (0x0B), is deliberately NOT tested:
// XML 1.0 forbids it outright, even as a character reference, so any document containing one
// is malformed. The first build of this probe did contain one and would not parse.

// One entry per question, in order. build(body, ref) returns the XML replacing the whole <w:p>.
// Each asks the importer a genuinely different question, not a restyling of one idea.
const ENC = [
  { name: 'br inside one run (what you have now)', build: (b, r) => `<w:p><w:r>${RPR}${T(b)}<w:br/>${T(r)}</w:r></w:p>` },
  { name: 'w:cr element instead of w:br',          build: (b, r) => `<w:p><w:r>${RPR}${T(b)}<w:cr/>${T(r)}</w:r></w:p>` },
  { name: 'literal newline inside w:t',            build: (b, r) => `<w:p><w:r>${RPR}${T(b + NL + r)}</w:r></w:p>` },
  { name: 'literal <br> as visible text',          build: (b, r) => `<w:p><w:r>${RPR}${T(b + '&lt;br&gt;' + r)}</w:r></w:p>` },
  { name: 'separate w:p, zero spacing',            build: (b, r) => `<w:p><w:r>${RPR}${T(b)}</w:r></w:p><w:p><w:pPr>${TIGHT}</w:pPr><w:r>${RPR}${T(r)}</w:r></w:p>` },
  { name: 'two trailing spaces then br',           build: (b, r) => `<w:p><w:r>${RPR}${T(b + '  ')}<w:br/>${T(r)}</w:r></w:p>` },
  { name: 'br, reference in its own run',          build: (b, r) => `<w:p><w:r>${RPR}${T(b)}</w:r><w:r>${RPR}<w:br/></w:r><w:r>${RPR}${T(r)}</w:r></w:p>` },
  { name: 'separate w:p paragraph',                build: (b, r) => `<w:p><w:r>${RPR}${T(b)}</w:r></w:p><w:p><w:r>${RPR}${T(r)}</w:r></w:p>` },
  { name: 'br with explicit textWrapping type',    build: (b, r) => `<w:p><w:r>${RPR}${T(b)}<w:br w:type="textWrapping"/>${T(r)}</w:r></w:p>` },
  { name: 'no break at all (control)',             build: (b, r) => `<w:p><w:r>${RPR}${T(b + ' ' + r)}</w:r></w:p>` },
];

const file = path.join(SRC, 'Coursera_Import_Module_1_Graded_Quiz_Managing.docx');
if (!fs.existsSync(file)) { console.error('ENOENT ' + file + String.fromCharCode(10) + 'Build the graded set first.'); process.exit(1); }

const ex = path.join(OUT, '_x');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
execFileSync('unzip', ['-o', '-q', file, '-d', ex]);
const docPath = path.join(ex, 'word', 'document.xml');
let xml = fs.readFileSync(docPath, 'utf8');

// Feedback paragraphs in document order: four per question, ten questions.
const paraRe = /<w:p\b(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g;
const fb = (xml.match(paraRe) || []).filter(p => /<w:t[^>]*>Feedback: /.test(p));
if (fb.length !== 40) { console.error(`expected 40 feedback paragraphs, found ${fb.length}`); process.exit(1); }

let n = 0;
for (const p of fb) {
  const q = Math.floor(n / 4);                      // four options per question
  const enc = ENC[q % ENC.length];
  const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]);
  const body = texts[0].replace(/^Feedback: /, `Feedback: [E${q + 1}] `);
  const ref = texts.slice(1).join('').trim() || '(reference missing)';
  xml = xml.replace(p, enc.build(body, ref));
  n++;
}
fs.writeFileSync(docPath, xml, 'utf8');

const outFile = path.join(OUT, 'PROBE_Module_1_break_encodings.docx');
zipDir(ex, outFile);
fs.rmSync(ex, { recursive: true, force: true });
console.log('WROTE ' + path.basename(outFile));
console.log('');
ENC.forEach((e, i) => console.log(`  Q${String(i + 1).padStart(2)}  [E${i + 1}]  ${e.name}`));
