// Removes EMPTY PARAGRAPHS from the importable section of built .docx files, and checks that
// none remain. Works on the finished document, so it covers every course whatever built it.
//
//     node src/fix-section-blanks.js --check <dir|file> ...     report only, exit 1 if any
//     node src/fix-section-blanks.js <dir|file> ...             rewrite in place
//
// WHY THIS EXISTS. From 2026-11-25 Coursera began refusing documents with "Content couldn't be
// processed" — a file-level error naming no question. The documents had not changed: files
// delivered weeks earlier in exactly the same shape had imported, and the packages were
// byte-identical to them in every part except word/document.xml. What distinguishes a document
// that now imports from one that does not is the EMPTY PARAGRAPHS inside the importable
// section: a five-question practice quiz carried 26 of them, a ten-question graded quiz 51.
//
// The evidence, in the order it arrived:
//
//   * Cybersecurity Course 3 M1L2 failed. Its prompts were two paragraphs each; joining them
//     into one — four fewer paragraphs — made it import. Nothing else about it changed.
//   * M1L3 then failed, and it had no multi-paragraph prompt. Removing its 26 empty paragraphs
//     made it, and the rest of that course's practice quizzes, import.
//   * GenAIOps Course 1's Module 3 graded quiz, rebuilt afterwards and deliberately left in
//     the old shape, failed with 51 empty paragraphs present.
//
// One rule explains all three: a paragraph the import grammar does not name can end a question
// early, and an empty one is such a paragraph. This file's sibling `para()` helpers have said
// as much for months — "an empty line inside a prompt could terminate it for the importer" —
// but the question blocks were built with real empty paragraphs anyway.
//
// THE GAP IS KEPT. Deleting a blank paragraph would run the options together on the page, so
// the space it provided is reapplied as `w:before` spacing on the paragraph that follows it.
// That is what the convention asks for in the first place: the gap is paragraph SPACING, never
// an empty paragraph.
//
// THE REFERENCE LINE IS NEVER TOUCHED. A "Refer to" paragraph must stay strictly zero-spaced so
// it sits hard against its feedback — the probe upload of 2026-09-28 settled that, and the
// verifiers check it. If the paragraph after a blank is a reference line, the gap is dropped
// rather than applied; nothing else in the document moves.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { zipDir } = require('./lib-zipwriter');

const PARA = /<w:p\b(?:(?!<w:p\b)[\s\S])*?<\/w:p>|<w:p\b[^>]*\/>/g;
const textOf = p => [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('');
const START = /Importable content starts here/i;
const END = /End of importable content|Importable content ends here/i;
const GAP = '<w:spacing w:after="0" w:before="200" w:line="276" w:lineRule="auto"/>';

// Give a paragraph the gap that the deleted blank above it used to provide.
function addGapBefore(p) {
  if (/^<w:p\b[^>]*\/>$/.test(p)) return p;                      // self-closing, nothing to hold it
  if (/<w:spacing\b[^>]*\/>/.test(p)) {
    return p.replace(/<w:spacing\b([^>]*)\/>/, (m, attrs) =>
      /w:before=/.test(attrs)
        ? `<w:spacing${attrs.replace(/w:before="[^"]*"/, 'w:before="200"')}/>`
        : `<w:spacing w:before="200"${attrs}/>`);
  }
  if (/<w:pStyle\b[^>]*\/>/.test(p)) return p.replace(/(<w:pStyle\b[^>]*\/>)/, `$1${GAP}`);
  if (/<w:pPr>/.test(p)) return p.replace('<w:pPr>', `<w:pPr>${GAP}`);
  return p.replace(/^(<w:p[^>]*>)/, `$1<w:pPr>${GAP}</w:pPr>`);
}

// Returns {removed, xml} for one document.xml string.
function strip(xml) {
  const paras = xml.match(PARA) || [];
  const si = paras.findIndex(p => START.test(textOf(p)));
  const ei = paras.findIndex(p => END.test(textOf(p)));
  if (si < 0 || ei < 0 || ei <= si) return { removed: 0, xml, note: 'no importable section' };

  const head = paras.slice(0, si + 1);
  const body = paras.slice(si + 1, ei);
  const tail = paras.slice(ei);

  const out = [];
  let pending = false, removed = 0;
  for (const p of body) {
    if (!textOf(p).trim()) { pending = true; removed++; continue; }
    out.push(pending && !/^Refer to\s/i.test(textOf(p).trim()) ? addGapBefore(p) : p);
    pending = false;
  }
  if (!removed) return { removed: 0, xml };

  const first = paras[0];
  const last = paras[paras.length - 1];
  const before = xml.slice(0, xml.indexOf(first));
  const after = xml.slice(xml.lastIndexOf(last) + last.length);
  return { removed, xml: before + head.join('') + out.join('') + tail.join('') + after };
}

function docxFiles(target) {
  const st = fs.statSync(target);
  if (st.isFile()) return target.endsWith('.docx') ? [target] : [];
  const out = [];
  for (const e of fs.readdirSync(target, { withFileTypes: true })) {
    const p = path.join(target, e.name);
    if (e.isDirectory()) out.push(...docxFiles(p));
    else if (e.name.endsWith('.docx')) out.push(p);
  }
  return out.sort();
}

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const targets = args.filter(a => a !== '--check');
if (!targets.length) {
  console.error('usage: node src/fix-section-blanks.js [--check] <dir|file> ...');
  process.exit(2);
}

const tmpRoot = path.join(require('os').tmpdir(), 'fix-section-blanks');
let touched = 0, clean = 0, failed = 0;
for (const t of targets) {
  for (const file of docxFiles(t)) {
    const work = path.join(tmpRoot, path.basename(file).replace(/\W+/g, '_'));
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    try {
      execFileSync('unzip', ['-o', '-q', file, '-d', work]);
      const docPath = path.join(work, 'word', 'document.xml');
      const { removed, xml, note } = strip(fs.readFileSync(docPath, 'utf8'));
      if (note) { console.log(`  --  ${path.basename(file)}  (${note})`); continue; }
      if (!removed) { clean++; continue; }
      touched++;
      if (checkOnly) {
        failed++;
        console.log(`  !!  ${removed} empty paragraph(s) in the import section: ${path.basename(file)}`);
      } else {
        fs.writeFileSync(docPath, xml, 'utf8');
        fs.rmSync(file, { force: true });
        zipDir(work, file);
        console.log(`  fixed  ${String(removed).padStart(3)} removed  ${path.basename(file)}`);
      }
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }
}

if (checkOnly) {
  console.log(`\n${clean} document(s) already clean · ${failed} still carrying empty paragraphs`);
  process.exit(failed ? 1 : 0);
}
console.log(`\n${touched} document(s) rewritten · ${clean} already clean`);
