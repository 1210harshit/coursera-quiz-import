// Outline parser for "GenAI for Marketing & Customer Engagement".
// Differs from the OSHA outline: "Module N: Title" and "Lesson N: Title" are single lines.
// The document also contains an older "Graded Assessment" section further down whose
// content must NOT be treated as course structure — parsing stops when it is reached.
const fs = require('fs');
const path = require('path');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const xml = fs.readFileSync(path.join(SP, 'genai-marketing', 'outline', 'word', 'document.xml'), 'utf8');
const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
                  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const clean = s => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

function paraText(p) {
  let t = '';
  const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let tm;
  while ((tm = tRe.exec(p)) !== null) t += dec(tm[1]);
  return t;
}

const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [null, xml])[1];
const blocks = [];
const blockRe = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
let bm;
while ((bm = blockRe.exec(body)) !== null) {
  const b = bm[0];
  if (b.startsWith('<w:tbl')) {
    const rows = [];
    const rowRe = /<w:tr\b[\s\S]*?<\/w:tr>/g;
    let rm;
    while ((rm = rowRe.exec(b)) !== null) {
      const cells = [];
      const cellRe = /<w:tc>[\s\S]*?<\/w:tc>/g;
      let cm;
      while ((cm = cellRe.exec(rm[0])) !== null) {
        const pRe = /<w:p\b[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g;
        let pm2; const ps = [];
        while ((pm2 = pRe.exec(cm[0])) !== null) {
          const t = paraText(pm2[0]);
          if (t.trim()) ps.push(t.trim());
        }
        cells.push(clean(ps.join(' ')));
      }
      rows.push(cells);
    }
    blocks.push({ type: 'table', rows });
  } else {
    blocks.push({ type: 'p', text: clean(paraText(b)) });
  }
}

const map = {};
const meta = {};
const course = { title: '', instructor: '', los: {}, quizMinutes: null };
let mod = null, les = null, stop = false;

for (const b of blocks) {
  if (stop) break;

  if (b.type === 'p') {
    const t = b.text.replace(/^[••\-\s]+/, '');
    let m;

    // The old assessment section — stop treating anything below as course structure.
    if (/^Graded Assessment\b/i.test(t)) { stop = true; break; }

    if ((m = t.match(/^Course Title\s*:\s*(.+)$/i))) course.title = m[1].trim();
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i))) course.instructor = m[1].trim();
    if ((m = t.match(/^LO(\d+)\s*:\s*(.+)$/))) course.los['LO' + m[1]] = m[2].trim();

    if ((m = t.match(/^Module\s+(\d+)\s*:\s*(.+)$/i))) {
      mod = +m[1]; les = null;
      meta['M' + mod] = meta['M' + mod] || { title: m[2].trim(), lessons: {} };
      meta['M' + mod].title = m[2].trim();
      continue;
    }
    if ((m = t.match(/^Aligned Learning Objective\s*:\s*(LO\d+)/i)) && mod)
      meta['M' + mod].alignedLO = m[1];
    if ((m = t.match(/^Lesson\s+(\d+)\s*:\s*(.+)$/i)) && mod) {
      les = +m[1];
      meta['M' + mod].lessons[les] = { title: m[2].trim() };
      continue;
    }
    continue;
  }

  // course-level quiz duration
  for (const cells of b.rows) {
    if (cells.length >= 5 && /^Graded Quiz$/i.test(cells[0])) {
      const mm = cells[4].match(/(\d+)\s*min/i);
      if (mm) course.quizMinutes = +mm[1];
    }
  }

  if (!mod || !les) continue;
  for (const cells of b.rows) {
    if (cells.length < 2) continue;
    const m = cells[0].match(/^Video\s+(\d+)$/i);
    if (!m) continue;
    const key = `M${mod}L${les}V${m[1]}`;
    if (map[key]) { console.error('WARN duplicate ' + key + ': ' + cells[1]); continue; }
    map[key] = {
      video: cells[1], module: mod, lesson: les,
      moduleTitle: meta['M' + mod].title,
      lessonTitle: meta['M' + mod].lessons[les].title,
    };
  }
}

console.log(JSON.stringify({ map, meta, course }, null, 2));
