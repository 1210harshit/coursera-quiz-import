// Extract logical lines from a docx: each paragraph is split on <w:br/>, because this
// source puts options and explanations on separate BREAK-separated lines inside one
// paragraph rather than in separate paragraphs.
const fs = require('fs');

const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
                  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

function lines(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [null, xml])[1];
  const out = [];
  const pRe = /<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
  let pm;
  while ((pm = pRe.exec(body)) !== null) {
    let t = '';
    const tok = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/>/g;
    let tm;
    while ((tm = tok.exec(pm[0])) !== null) t += tm[1] !== undefined ? dec(tm[1]) : '\n';
    for (const seg of t.split('\n')) {
      out.push(seg.replace(/ /g, ' ').replace(/\s+$/, '').trim());
    }
  }
  return out;
}

module.exports = { lines };

if (require.main === module) {
  lines(process.argv[2]).forEach(l => console.log(l));
}
