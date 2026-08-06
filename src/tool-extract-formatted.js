const fs = require('fs');

const file = process.argv[2];
const xml = fs.readFileSync(file, 'utf8');

// Split into paragraphs
function decode(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

// Handle tables by marking rows
let out = [];

// Walk through body: find <w:p ...>...</w:p> and <w:tbl>...</w:tbl>
const bodyMatch = xml.match(/<w:body>([\s\S]*)<\/w:body>/);
const body = bodyMatch ? bodyMatch[1] : xml;

function paraText(p) {
  // style
  const styleM = p.match(/<w:pStyle w:val="([^"]*)"/);
  const style = styleM ? styleM[1] : '';
  // numbering
  const numM = p.match(/<w:numPr>/);
  let text = '';
  const runRe = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
  let rm;
  while ((rm = runRe.exec(p)) !== null) {
    const run = rm[1];
    const isBold = /<w:b\/>|<w:b w:val="(?:1|true|on)"/.test(run);
    const hlM = run.match(/<w:highlight w:val="([^"]*)"/);
    const colorM = run.match(/<w:color w:val="([^"]*)"/);
    let t = '';
    const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let tm;
    while ((tm = tRe.exec(run)) !== null) t += decode(tm[1]);
    if (/<w:tab\/>/.test(run)) t = '\t' + t;
    if (/<w:br\/>/.test(run)) t = t + '\n';
    if (!t) continue;
    let marks = '';
    if (isBold) marks += 'B';
    if (hlM) marks += 'H:' + hlM[1];
    if (colorM && colorM[1] !== '000000' && colorM[1] !== 'auto') marks += 'C:' + colorM[1];
    text += marks ? `[${marks}]{${t}}` : t;
  }
  let prefix = '';
  if (style && style.toLowerCase().includes('heading')) prefix = `<<${style}>> `;
  else if (style && style !== 'Normal') prefix = `<${style}> `;
  if (numM) prefix += '• ';
  return prefix + text;
}

const blockRe = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
let bm;
while ((bm = blockRe.exec(body)) !== null) {
  const block = bm[0];
  if (block.startsWith('<w:tbl')) {
    out.push('=== TABLE START ===');
    const rowRe = /<w:tr\b[\s\S]*?<\/w:tr>/g;
    let rm2;
    while ((rm2 = rowRe.exec(block)) !== null) {
      const row = rm2[0];
      const cellRe = /<w:tc>[\s\S]*?<\/w:tc>/g;
      let cm; const cells = [];
      while ((cm = cellRe.exec(row)) !== null) {
        const cell = cm[0];
        const pRe = /<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
        let pm; const ps = [];
        while ((pm = pRe.exec(cell)) !== null) {
          const t = paraText(pm[0]);
          if (t.trim()) ps.push(t);
        }
        cells.push(ps.join(' ⏎ '));
      }
      out.push('| ' + cells.join(' | ') + ' |');
    }
    out.push('=== TABLE END ===');
  } else {
    out.push(paraText(block));
  }
}

console.log(out.join('\n'));
