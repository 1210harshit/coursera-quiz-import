// Bridging the Soft Skills Gap — outline .docx -> outline.json for the QUIZ builder.
// (The course-content importer uses bridging-soft-skills-parse-course.js instead.)
//
// Supplies three things the quiz documents need and the assessment files do not state:
//   map     M<x>L<y>V<z> -> the video title quoted in every feedback line
//   meta    module and lesson titles, aligned objective, the lessons' own objectives
//   course  title, and the Est. Time the outline budgets for each assessment
//
// Video rows in this outline are labelled bare "Video", never "Video 1"/"Video 2", so the
// V-number is the row's position within its lesson table. That matches the quiz files, whose
// mappings run M1L1V1, M1L1V2 in the order the lesson presents them.
//
// The outro video sits in the Supplementary Items table with the same bare label. Numbering it
// would mint a phantom M4L2V3, so module and lesson scope are cleared at that heading — the
// trap every outline parser in this repo has to defuse.
const path = require('path');
const { readBlocks, isItemHeader, cellText, minutes } = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'bridging-soft-skills';
const blocks = readBlocks(path.join(SP, SLUG, 'outline', 'word', 'document.xml'));

const warn = [];
const map = {};
const meta = {};
const course = {
  title: '', subtitle: '', instructor: '', los: {},
  gradedMinutes: {},      // "M1" -> minutes budgeted for that module's graded assessment
  practiceMinutes: {},    // "M1L1" -> minutes budgeted for that lesson's practice quiz
};

let mod = null, les = null, vNum = 0;
let inPart2 = false, objMode = false;

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    let m;
    if (!t) continue;

    if ((m = t.match(/^Course Title\s*:\s*(.+)$/i)))    { course.title = m[1].trim(); continue; }
    if ((m = t.match(/^Course Subtitle\s*:\s*(.+)$/i))) { course.subtitle = m[1].trim(); continue; }
    if ((m = t.match(/^Lead Instructor\s*:\s*(.+)$/i))) { course.instructor = m[1].trim(); continue; }
    if (!inPart2 && (m = t.match(/^LO(\d+)\s*:\s*(.+)$/i))) { course.los['LO' + m[1]] = m[2].trim(); continue; }

    if (/^Part\s*2\b/i.test(t)) { inPart2 = true; continue; }
    if (/^(Closing Items|Appendix\b)/i.test(t)) break;
    if (!inPart2) continue;

    // Course-level tables hold an intro and an outro video. Clearing scope keeps them out of
    // the M<x>L<y>V<z> map, which addresses lesson videos only.
    if (/^(Introduction to (the )?Entire Course|Supplementary Items|Pathway Gate)\b/i.test(t)) {
      mod = les = null; objMode = false; continue;
    }

    if ((m = t.match(/^Module\s+(\d+)\s*:\s*(.+)$/i))) {
      mod = +m[1]; les = null; objMode = false;
      meta['M' + mod] = { title: m[2].trim(), alignedLO: '', objectives: [], lessons: {} };
      continue;
    }
    if ((m = t.match(/^Lesson\s+(\d+)\s*:\s*(.+)$/i)) && mod) {
      les = +m[1]; vNum = 0; objMode = false;
      meta['M' + mod].lessons[les] = { title: m[2].trim(), objectives: [] };
      continue;
    }
    if ((m = t.match(/^Aligned Learning Objective\s*:\s*(.+)$/i)) && mod) {
      meta['M' + mod].alignedLO = m[1].trim(); continue;
    }

    // Three per lesson, listed as bullets and closed by the Now-Next-Later block.
    if (/higher-order objectives\b/i.test(t) && mod && les) { objMode = true; continue; }
    if (/^Now\s*[–—-]\s*Next\s*[–—-]\s*Later\s*:?/i.test(t) || /^(Now|Next|Later)\s*:/i.test(t)) {
      objMode = false; continue;
    }
    if (objMode && mod && les) {
      meta['M' + mod].lessons[les].objectives.push(t);
      meta['M' + mod].objectives.push(t);
      continue;
    }
    continue;
  }

  const rows = b.rows.filter(r => r.length >= 2);
  if (!rows.length || !isItemHeader(rows[0])) continue;

  for (const cells of rows.slice(1)) {
    const [label, title, , , est] = cells.map(cellText);

    // Assessment budgets are stated per item; the quiz builder turns them into hh:mm.
    if (/^graded\s*(quiz|assessment)/i.test(label) && mod) {
      const v = minutes(est);
      if (v) course.gradedMinutes['M' + mod] = v;
      else warn.push('M' + mod + ': graded assessment has no Est. Time');
      continue;
    }
    if (/^practice\s*quiz/i.test(label) && mod && les) {
      const v = minutes(est);
      if (v) course.practiceMinutes['M' + mod + 'L' + les] = v;
      else warn.push('M' + mod + 'L' + les + ': practice quiz has no Est. Time');
      continue;
    }

    if (!mod || !les) continue;
    const vm = label.match(/^Video\s*(\d*)$/i);
    if (!vm) continue;
    const n = vm[1] ? +vm[1] : ++vNum;
    const key = 'M' + mod + 'L' + les + 'V' + n;
    if (map[key]) { warn.push('duplicate ' + key + ': ' + title); continue; }
    if (!title) { warn.push(key + ': video row has no title'); continue; }
    map[key] = {
      video: title,
      module: mod,
      lesson: les,
      moduleTitle: meta['M' + mod].title,
      lessonTitle: meta['M' + mod].lessons[les].title,
    };
  }
}

if (process.argv.includes('--report')) {
  console.log(course.title);
  for (const k of Object.keys(meta)) {
    const m = meta[k];
    console.log('  ' + k + ' — ' + m.title);
    for (const l of Object.keys(m.lessons)) {
      const vids = Object.keys(map).filter(x => x.startsWith(k + 'L' + l + 'V'));
      console.log('    L' + l + ': ' + m.lessons[l].title);
      vids.forEach(v => console.log('       ' + v + '  ' + map[v].video));
    }
  }
  console.log('\ngraded budgets:   ' + JSON.stringify(course.gradedMinutes));
  console.log('practice budgets: ' + JSON.stringify(course.practiceMinutes));
  console.log('\n' + Object.keys(map).length + ' videos mapped · warnings: ' + warn.length);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify({ map, meta, course }, null, 2));
}
