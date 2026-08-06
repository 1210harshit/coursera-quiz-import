const fs = require('fs');

const xml = fs.readFileSync(require('path').join(__dirname,'genai-retail','outline','word','document.xml'), 'utf8');
const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
                  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const clean = s => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

function paraText(p) {
  let t = '';
  const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let tm;
  while ((tm = tRe.exec(p)) !== null) t += dec(tm[1]);
  return t;
}

const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [null, xml])[1];

// Walk top-level blocks in document order
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
        let pm; const ps = [];
        while ((pm = pRe.exec(cm[0])) !== null) {
          const t = paraText(pm[0]);
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

const map = {};        // "M1L1V1" -> {video, module, lesson, moduleTitle, lessonTitle}
const meta = {};       // "M1" -> {title, lessons:{1:{title}}, alignedLO}
const course = { title: '', instructor: '', los: {}, quizMinutes: null };
let mod = null, les = null;

for (const b of blocks) {
  if (b.type === 'p') {
    let m;
    const t = b.text.replace(/^[••\-\s]+/, '');
    if ((m = t.match(/^Course Title\s*:\s*(.+)$/))) course.title = m[1].trim();
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/))) course.instructor = m[1].trim();
    if ((m = t.match(/^LO(\d+)\s*:\s*(.+)$/))) course.los['LO' + m[1]] = m[2].trim();
    // This outline lists SEVERAL aligned objectives per module under a plural heading,
    // each on its own bullet ("LO1: ...", "LO2: ...").
    if (/^Aligned Learning Objectives?\s*:/i.test(t) && mod) {
      meta['M' + mod].alignedLOs = meta['M' + mod].alignedLOs || [];
      meta['M' + mod]._inLOs = true;
      continue;
    }
    if ((m = t.match(/^(LO\d+)\s*:/)) && mod && meta['M' + mod]._inLOs) {
      if (!meta['M' + mod].alignedLOs.includes(m[1])) meta['M' + mod].alignedLOs.push(m[1]);
      continue;
    }

    // Course-level sections (e.g. "Supplementary Items for Entire Course") are not
    // lesson content — leave module/lesson scope so their tables are not captured.
    if (/^(Supplementary Items|PART\s+\d|Can each of these modules)/i.test(b.text)) {
      mod = null; les = null; continue;
    }
    if ((m = b.text.match(/^Module\s+(\d+)\s*$/))) {
      mod = +m[1]; les = null;
      meta['M' + mod] = meta['M' + mod] || { title: '', lessons: {} };
      continue;
    }
    if ((m = b.text.match(/^Title of the Module\s*:\s*(.+)$/)) && mod) {
      meta['M' + mod].title = m[1].trim(); continue;
    }
    if ((m = b.text.match(/^Lesson\s+(\d+)\s*$/)) && mod) {
      les = +m[1];
      meta['M' + mod]._inLOs = false;   // the aligned-objectives list ends here
      meta['M' + mod].lessons[les] = meta['M' + mod].lessons[les] || { title: '' };
      continue;
    }
    if ((m = b.text.match(/^Title of the Lesson\s*:\s*(.+)$/)) && mod && les) {
      meta['M' + mod].lessons[les].title = m[1].trim(); continue;
    }
    continue;
  }
  // Graded Quiz row in the course-level supplementary table gives total quiz minutes
  for (const cells of b.rows) {
    if (cells.length >= 5 && /^Graded Quiz$/i.test(cells[0])) {
      const mm = cells[4].match(/(\d+)\s*min/i);
      if (mm) course.quizMinutes = +mm[1];
      // The row also states how many questions that budget covers, which lets the
      // per-question rate be derived rather than assumed.
      const qq = cells[3].match(/(\d+)\s*multiple[- ]choice questions/i);
      if (qq) course.quizClaimedQuestions = +qq[1];
    }
  }

  // table: pick up "Video N" rows for the current module/lesson
  if (!mod || !les) continue;
  for (const cells of b.rows) {
    if (cells.length < 2) continue;
    const m = cells[0].match(/^Video\s+(\d+)$/i);
    if (!m) continue;
    const key = `M${mod}L${les}V${m[1]}`;
    if (map[key]) { console.error('WARN duplicate ' + key + ': ' + cells[1]); continue; }
    map[key] = {
      video: cells[1],
      module: mod, lesson: les,
      moduleTitle: meta['M' + mod].title,
      lessonTitle: meta['M' + mod].lessons[les].title,
    };
  }
}

console.log(JSON.stringify({ map, meta, course }, null, 2));
