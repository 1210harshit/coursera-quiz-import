// Outline parser scoped to COURSE 1 only.
// The source holds four courses; capture starts at "Course 1" and stops at "Course 2".
// Modules and lessons share the same heading level here, so they are told apart by text.
const fs = require('fs');
const path = require('path');

const SP = __dirname;
const xml = fs.readFileSync(path.join(SP, 'pm-course-1', 'outline', 'word', 'document.xml'), 'utf8');
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
let inCourse1 = false, mod = null, les = null;

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    let m;

    if (/^Course\s*1\b/i.test(t)) { inCourse1 = true; mod = null; les = null; continue; }
    if (/^Course\s*[2-9]\b/i.test(t)) break;          // Course 1 only
    if (!inCourse1) continue;

    if ((m = t.match(/^Title of the Course\s*:\s*(.+)$/i))) { course.title = m[1].trim(); continue; }
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i))) { course.instructor = m[1].trim(); continue; }
    if ((m = t.match(/^C1LO(\d+)\s*:\s*(.+)$/i))) { course.los['C1LO' + m[1]] = m[2].trim(); continue; }

    // "Introduction to Course 1" and similar are not lesson content
    if (/^Introduction to Course/i.test(t)) { mod = null; les = null; continue; }

    if ((m = t.match(/^Module\s+(\d+)\s*$/i))) {
      mod = +m[1]; les = null;
      meta['M' + mod] = meta['M' + mod] || { title: '', lessons: {} };
      continue;
    }
    if ((m = t.match(/^Title of the Module\s*:\s*(.+)$/i)) && mod) { meta['M' + mod].title = m[1].trim(); continue; }
    if ((m = t.match(/^Aligned Course-level Learning Objective\s*:\s*(C1LO\d+)/i)) && mod) {
      meta['M' + mod].alignedLOs = [m[1]];
      continue;
    }
    if ((m = t.match(/^Lesson\s+(\d+)\s*$/i)) && mod) {
      les = +m[1];
      meta['M' + mod].lessons[les] = meta['M' + mod].lessons[les] || { title: '' };
      continue;
    }
    if ((m = t.match(/^Title of the Lesson\s*:\s*(.+)$/i)) && mod && les) {
      meta['M' + mod].lessons[les].title = m[1].trim();
      continue;
    }
    continue;
  }

  if (!inCourse1) continue;

  for (const cells of b.rows) {
    if (cells.length >= 5 && /^Graded Quiz$/i.test(cells[0])) {
      const mm = cells[4].match(/(\d+)\s*min/i);
      if (mm) course.quizMinutes = +mm[1];
      const qq = cells[3].match(/(\d+)\s*multiple[- ]choice questions/i);
      if (qq) course.quizClaimedQuestions = +qq[1];
    }
  }

  if (!mod || !les) continue;
  for (const cells of b.rows) {
    if (cells.length < 2) continue;
    const m = cells[0].match(/^Video\s+(\d+)$/i);
    if (!m) continue;
    const key = `M${mod}L${les}V${m[1]}`;
    if (map[key]) { console.error('WARN duplicate ' + key + ': ' + cells[1]); continue; }
    // Modules 2 and 3 repeat the item label inside the title cell ("Video 1: Understanding
    // SMART Goals"). The reference line already states the video, so the prefix is dropped
    // to avoid "Refer to M2L1V1: Video 1: Understanding SMART Goals".
    map[key] = {
      video: cells[1].replace(/^Video\s*\d+\s*:\s*/i, '').trim(), module: mod, lesson: les,
      moduleTitle: meta['M' + mod].title,
      lessonTitle: meta['M' + mod].lessons[les].title,
    };
  }
}

console.log(JSON.stringify({ map, meta, course }, null, 2));
