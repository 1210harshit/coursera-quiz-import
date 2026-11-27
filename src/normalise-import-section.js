// Rewrites the importable section of a built .docx into the EXACT layout of a document
// Coursera has accepted, and checks that it matches.
//
//     node src/normalise-import-section.js --check <dir|file> ...   report only, exit 1 on drift
//     node src/normalise-import-section.js <dir|file> ...           rewrite in place
//
// WHY THIS EXISTS. From 2026-11-25 Coursera began refusing documents with "Content couldn't be
// processed", a file-level error naming no question. Nothing in the documents had changed —
// files delivered weeks earlier in the same shape had imported. Chasing it one guess at a time
// cost several uploads, so this stops guessing: it makes a document's import section
// IDENTICAL IN LAYOUT to one that is known to import, leaving the text alone.
//
// The reference document is Cybersecurity Course 3's M1L2 practice quiz, which the course
// owner confirmed imports. Its paragraph properties, per role, are the constants below. Every
// one of them was read out of that file rather than invented.
//
// WHAT IT CHANGES, and nothing else:
//   * empty paragraphs inside the section are deleted — the gap they provided is already
//     carried by the spacing below;
//   * every remaining paragraph's <w:pPr> is replaced by the canonical one for its role, with
//     its own <w:rPr> preserved so fonts and colour are untouched;
//   * runs, text and order are not touched at all.
//
// WHAT IT WILL NOT DO. It refuses to run on a document whose section it cannot parse into
// clean roles — a stray paragraph that is neither a question header, prompt, option, feedback
// nor reference is reported and the file is left alone, because a document that does not fit
// the grammar needs a person, not a reformat.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { zipDir } = require('./lib-zipwriter');

const PARA = /<w:p\b(?:(?!<w:p\b)[\s\S])*?<\/w:p>|<w:p\b[^>]*\/>/g;
const textOf = p => [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

const IND = '<w:ind w:left="0" w:firstLine="0"/>';
// Read out of the document that imports. Do not edit these without a confirmed upload.
const PPR = {
  qhead:    '<w:pStyle w:val="Heading4"/>',
  prompt:   `<w:spacing w:after="200" w:before="0" w:line="276" w:lineRule="auto"/>${IND}`,
  option:   `<w:spacing w:after="0" w:before="200" w:line="276" w:lineRule="auto"/>${IND}`,
  feedback: '',
  refer:    `<w:spacing w:after="0" w:before="0" w:line="240" w:lineRule="auto"/>${IND}`,
};

const roleOf = t =>
  /^Question\s+\d+\s*[-–—]/i.test(t) ? 'qhead'
  : /^\*?[A-F]\s*[:.]\s+\S/.test(t) ? 'option'
  : /^Feedback\s*[:–-]/i.test(t) ? 'feedback'
  : /^Refer to\s/i.test(t) ? 'refer'
  : 'prompt';

// ONLY THE SECTION IS REWRITTEN, AS A SUBSTRING. The first version of this function rebuilt
// the whole document by concatenating its <w:p> elements — which silently DELETED every
// <w:tbl>, because tables are not paragraphs. Each quiz carries one: the traceability table
// after the end marker. Every document this tool had "fixed" lost it, every document that
// still imported had been built by the builder and kept it, and the correlation was perfect.
// Splicing a substring cannot lose anything outside the splice, so the rest of the file —
// tables, images, section properties and all — is now byte-for-byte untouched.
function rebuild(xml) {
  const all = xml.match(PARA) || [];
  const startPara = all.find(p => /Importable content starts here/i.test(textOf(p)));
  const endPara = all.find(p => /End of importable content|Importable content ends here/i.test(textOf(p)));
  if (!startPara || !endPara) return { skip: 'no importable section' };

  const from = xml.indexOf(startPara) + startPara.length;
  const to = xml.lastIndexOf(endPara);
  if (to <= from) return { skip: 'markers out of order' };

  const slice = xml.slice(from, to);
  if (/<w:tbl>/.test(slice)) return { skip: 'a table inside the importable section' };
  const body = slice.match(PARA) || [];
  const out = [];
  let blanks = 0, reshaped = 0;
  // ONE BLANK PARAGRAPH STAYS, directly under the start marker. Every document the course
  // owner has confirmed importing has exactly one there; the first version of this tool
  // removed all of them, and the resulting file — identical to a working one in all 140
  // paragraphs, their roles, counts and properties — was refused. That lone paragraph was the
  // only thing separating them. It is reinstated rather than merely preserved, so a document
  // that never had one gains it too.
  const rPrSample = (/<w:rPr>[\s\S]*?<\/w:rPr>/.exec(slice) || [''])[0];
  const LEAD_BLANK = `<w:p><w:pPr>${rPrSample}</w:pPr></w:p>`;
  // A prompt is only legitimate directly after a question header; anywhere else a paragraph
  // that is not one of the four grammar lines is something this tool must not silently restyle.
  let afterHead = false;
  for (const p of body) {
    const t = textOf(p).trim();
    if (!t) { blanks++; continue; }
    const role = roleOf(t);
    if (role === 'prompt' && !afterHead) {
      return { skip: `an unrecognised paragraph inside the section: "${t.slice(0, 60)}"` };
    }
    afterHead = role === 'qhead';
    const rPr = (/<w:rPr>[\s\S]*?<\/w:rPr>(?=<\/w:pPr>)/.exec(p) || [''])[0];
    const want = `<w:pPr>${PPR[role]}${rPr}</w:pPr>`;
    const had = (/<w:pPr>[\s\S]*?<\/w:pPr>/.exec(p) || [''])[0];
    if (had !== want) reshaped++;
    const runs = p.slice(p.indexOf('</w:pPr>') >= 0 ? p.indexOf('</w:pPr>') + 8 : p.indexOf('>') + 1)
      .replace(/<\/w:p>$/, '');
    out.push(`<w:p>${want}${runs}</w:p>`);
  }
  const rebuilt = xml.slice(0, from) + LEAD_BLANK + out.join('') + xml.slice(to);
  // DRIFT IS MEASURED BY COMPARING THE RESULT, not by counting what was touched. Counting
  // made `--check` useless the moment the lead blank became deliberate: it was found in the
  // body, counted as a blank to remove, and every correct document reported as needing work.
  // A document already in canonical form rebuilds to itself.
  return { blanks, reshaped, changed: rebuilt !== xml, xml: rebuilt };
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
  console.error('usage: node src/normalise-import-section.js [--check] <dir|file> ...');
  process.exit(2);
}

const tmpRoot = path.join(require('os').tmpdir(), 'normalise-import-section');
let drift = 0, ok = 0, skipped = 0;
for (const t of targets) {
  for (const file of docxFiles(t)) {
    const work = path.join(tmpRoot, path.basename(file).replace(/\W+/g, '_'));
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    try {
      execFileSync('unzip', ['-o', '-q', file, '-d', work]);
      const docPath = path.join(work, 'word', 'document.xml');
      const r = rebuild(fs.readFileSync(docPath, 'utf8'));
      if (r.skip) { skipped++; console.log(`  --  ${path.basename(file)}  (${r.skip})`); continue; }
      if (!r.changed) { ok++; continue; }
      drift++;
      if (checkOnly) {
        console.log(`  !!  ${String(r.blanks).padStart(3)} blank, ${String(r.reshaped).padStart(3)} mis-shaped  ${path.basename(file)}`);
      } else {
        fs.writeFileSync(docPath, r.xml, 'utf8');
        fs.rmSync(file, { force: true });
        zipDir(work, file);
        console.log(`  fixed  ${String(r.blanks).padStart(3)} blank, ${String(r.reshaped).padStart(3)} reshaped  ${path.basename(file)}`);
      }
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }
}
console.log(`\n${ok} already canonical · ${drift} ${checkOnly ? 'needing work' : 'rewritten'}`
  + (skipped ? ` · ${skipped} skipped` : ''));
process.exit(checkOnly && drift ? 1 : 0);
