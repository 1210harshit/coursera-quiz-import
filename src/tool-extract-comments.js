const fs = require('fs');
const xml = fs.readFileSync(process.argv[2], 'utf8');
const d = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const cRe = /<w:comment\b([^>]*)>([\s\S]*?)<\/w:comment>/g;
let m;
while ((m = cRe.exec(xml)) !== null) {
  const attrs = m[1], body = m[2];
  const id = (attrs.match(/w:id="([^"]*)"/) || [])[1];
  const pRe = /<w:p\b[\s\S]*?<\/w:p>/g;
  let pm; const lines = [];
  while ((pm = pRe.exec(body)) !== null) {
    let t = '';
    const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let tm;
    while ((tm = tRe.exec(pm[0])) !== null) t += d(tm[1]);
    if (t.trim()) lines.push(t);
  }
  if (lines.length) {
    console.log('--- COMMENT id=' + id + ' ---');
    console.log(lines.join('\n'));
  }
}
