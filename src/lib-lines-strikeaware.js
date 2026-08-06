// Line extractor that DROPS struck-through ("cut") text.
// The source marks removed wording with <w:strike w:val="1"/> on the run; runs carrying
// <w:strike w:val="0"/> are explicitly un-struck and must be kept.
// Paragraphs are also split on <w:br/> so break-separated lines become separate lines.
const fs = require('fs');

const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
                  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

const STRUCK = /<w:strike(?:\s+w:val="(?:1|true|on)")?\s*\/>/;

function runIsStruck(runXml) {
  const rPr = (runXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
  if (!rPr) return false;
  const tag = rPr.match(/<w:strike[^>]*\/>/);
  if (!tag) return false;
  const val = (tag[0].match(/w:val="([^"]*)"/) || [])[1];
  if (val === undefined) return true;                 // bare <w:strike/> means on
  return /^(1|true|on)$/i.test(val);
}

function paragraphs(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [null, xml])[1];
  const out = [];
  const pRe = /<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
  let pm;
  while ((pm = pRe.exec(body)) !== null) {
    let t = '';
    const runRe = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
    let rm;
    while ((rm = runRe.exec(pm[0])) !== null) {
      const run = rm[0];
      if (runIsStruck(run)) continue;                 // drop cut text
      const tok = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/>/g;
      let tm;
      while ((tm = tok.exec(run)) !== null) t += tm[1] !== undefined ? dec(tm[1]) : '\n';
    }
    out.push(t);
  }
  return out;
}

function lines(file) {
  const out = [];
  for (const p of paragraphs(file)) {
    for (const seg of p.split('\n')) out.push(seg.replace(/ /g, ' ').trim());
  }
  return out;
}

module.exports = { lines, paragraphs, runIsStruck };

if (require.main === module) {
  lines(process.argv[2]).forEach(l => console.log(l));
}
