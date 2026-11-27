// DIAGNOSTIC, not production. Rebuilds a quiz as the SMALLEST possible .docx that still
// contains the same questions: no Guide Section, no embedded fonts, no image, no headers or
// footers, no theme, no numbering — eight parts instead of twenty.
//
//     node src/minimal-quiz-probe.js <built.docx> <out.docx>
//
// WHY. Every comparison between a document Coursera accepts and one it refuses has come back
// identical: same package parts, same OPC validity, same Guide Section, same paragraph roles,
// properties and run structure, same character repertoire, same grammar, same markers. Fixes
// derived from those comparisons have each worked once and then not generalised.
//
// So this stops comparing and strips instead. If the minimal document imports, the fault is
// in the surrounding template — the Guide Section, the fonts, the image, one of the parts —
// and it can be bisected by adding them back. If the minimal document is ALSO refused, then
// nothing in the file is at fault and the answer is in the item being imported into, or in
// the importer itself.
//
// The question text is copied verbatim out of the built document, so the only thing that
// changes is what surrounds it.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { zipDir } = require('./lib-zipwriter');

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: node src/minimal-quiz-probe.js <built.docx> <out.docx>');
  process.exit(2);
}

const PARA = /<w:p\b(?:(?!<w:p\b)[\s\S])*?<\/w:p>|<w:p\b[^>]*\/>/g;
const textOf = p => [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('');

const work = path.join(require('os').tmpdir(), 'minimal-quiz-probe');
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
const ex = path.join(work, 'src');
execFileSync('unzip', ['-o', '-q', src, '-d', ex]);
const xml = fs.readFileSync(path.join(ex, 'word', 'document.xml'), 'utf8');
const paras = xml.match(PARA) || [];
const si = paras.findIndex(p => /Importable content starts here/i.test(textOf(p)));
const ei = paras.findIndex(p => /End of importable content|Importable content ends here/i.test(textOf(p)));
if (si < 0 || ei < 0) { console.error('no importable section'); process.exit(1); }

// Plain paragraphs, default everything. Text is taken verbatim; nothing else survives.
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const P = t => `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
const body = [paras[si], ...paras.slice(si + 1, ei), paras[ei]]
  .map(p => textOf(p)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'"))
  .map(t => P(t.trim()))
  .join('');

const stage = path.join(work, 'out');
fs.mkdirSync(path.join(stage, '_rels'), { recursive: true });
fs.mkdirSync(path.join(stage, 'word', '_rels'), { recursive: true });

fs.writeFileSync(path.join(stage, '[Content_Types].xml'),
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  + '</Types>');

fs.writeFileSync(path.join(stage, '_rels', '.rels'),
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
  + '</Relationships>');

fs.writeFileSync(path.join(stage, 'word', '_rels', 'document.xml.rels'),
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');

fs.writeFileSync(path.join(stage, 'word', 'document.xml'),
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
  + `<w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`);

fs.rmSync(out, { force: true });
zipDir(stage, out);
fs.rmSync(work, { recursive: true, force: true });
const n = (body.match(/Question \d+/g) || []).length;
console.log(`WROTE  ${path.basename(out)}  —  ${n} questions, 4 package parts, no template at all`);
