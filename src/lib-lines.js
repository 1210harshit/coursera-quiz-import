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
      out.push(seg.replace(/\u00a0/g, ' ').replace(/\s+$/, '').trim());
    }
  }
  return out;
}

// The same split, but reporting whether each line's text was BOLD. Some sources mark the answer
// key with bold rather than with a star or a "Correct Answer:" line — Cybersecurity Course 1
// writes one of its practice quizzes that way, and read as plain text that document has no key
// at all, so every question in it was refused.
//
// A line counts as bold only when EVERY run carrying non-blank text is bold. A sentence with
// one emphasised word is therefore not mistaken for a marked answer, which matters because
// several of these sources bold a term inside an option's text.
//
// The text it returns is identical to lines(), line for line, so the two can be read in step.
// Is a run property switched ON? <w:b/> and <w:b w:val="1"/> are on; w:val="0"/"false"/"off"
// are OFF. The val test MUST be scoped to this tag's own attributes: an rPr routinely carries
// unrelated properties with val="0" (<w:kern w:val="0"/> is near-universal), so testing the
// whole rPr for val="0" silently cancels every strike and bold in the document. That bug hid
// three struck-out citations in Cybersecurity Course 1's final exam.
function onFlag(rPr, name) {
  // Literal regexes, never built from a string: escaping a regex through a string literal is
  // how the first version of this silently became /<w:strikes?.../ and matched nothing.
  const m = rPr.match(name === 'b' ? /<w:b(?:\s([^>]*?))?\/>/ : /<w:strike(?:\s([^>]*?))?\/>/);
  return !!m && !/w:val="(?:0|false|off)"/.test(m[1] || '');
}

function linesWithBold(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [null, xml])[1];
  const out = [];
  const pRe = /<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
  let pm;
  while ((pm = pRe.exec(body)) !== null) {
    let text = '';
    let bold = 0;
    let plain = 0;
    let droppedStruck = false;
    const push = () => {
      let t = text.replace(/\u00a0/g, ' ').replace(/\s+$/, '').trim();
      // Deleting a citation orphans its connector: "M3L3V3 + M3L3 FAQ" with the FAQ struck
      // reads "M3L3V3 +", which no longer matches the citation-line pattern at all, so the
      // whole line is skipped and the question ends up citing nothing. Only lines the filter
      // actually changed are tidied, so no other document can shift. Leading and trailing
      // connectors only: titles legitimately contain commas.
      if (droppedStruck) {
        t = t.replace(/\s+/g, ' ')
             .replace(/(?:\s*\+\s*){2,}/g, ' + ')
             .replace(/^\s*[+;,]\s*/, '')
             .replace(/\s*[+;,]\s*$/, '')
             .trim();
      }
      out.push({ text: t, bold: bold > 0 && plain === 0 });
      text = ''; bold = 0; plain = 0; droppedStruck = false;
    };
    const rRe = /<w:r\b[\s\S]*?<\/w:r>|<w:br\s*\/>/g;
    let rm;
    while ((rm = rRe.exec(pm[0])) !== null) {
      if (/^<w:br/.test(rm[0])) { push(); continue; }
      const rPr = (rm[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
      const isBold = onFlag(rPr, 'b');
      // STRUCK-THROUGH TEXT IS DELETED TEXT and is dropped. A reviewer who strikes a source
      // citation out has removed it; reading it anyway puts a reference in front of the learner
      // that the author crossed out. Cybersecurity Course 1's Module 3 graded quiz struck one
      // "+ M3L3 FAQ" and the FAQ still reached ten feedback references; its final exam struck
      // three whole citation lines.
      const isStruck = onFlag(rPr, 'strike');
      if (isStruck) { droppedStruck = true; continue; }
      const tok = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/>/g;
      let tm;
      while ((tm = tok.exec(rm[0])) !== null) {
        if (tm[1] === undefined) { push(); continue; }
        const piece = dec(tm[1]);
        text += piece;
        if (piece.trim()) { if (isBold) bold++; else plain++; }
      }
    }
    push();
  }
  return out;
}

module.exports = { lines, linesWithBold };

if (require.main === module) {
  lines(process.argv[2]).forEach(l => console.log(l));
}
