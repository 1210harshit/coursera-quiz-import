// High-Impact Communication for Sales Professionals — outline .docx -> outline.json
// for the QUIZ builder. Scoped to COURSE 1 only.
//
// The source is a five-course program in one document. Capture starts at "Course 1" and stops
// at "Course 2", the same containment cstp-course-1 needs.
//
// Headings are bare — "Module 1", "Lesson 1" — with the name on a following "Title of the
// Module:" / "Title of the Lesson:" line. Video rows carry their own number ("Video 1"), so the
// V in M<x>L<y>V<z> is read from the label rather than counted.
//
// Two video rows must stay out of the map. "Intro Video" is each module's own introduction and
// is unnumbered; a "Video 1" also appears in the "Introduction to Course 1" and "Supplementary
// Items" tables, where it is the course welcome and wrap-up. Both sit outside lesson scope, so
// clearing module and lesson at those headings keeps them from minting a phantom M<x>L<y>V1.
const path = require('path');
const { readBlocks, isItemHeader, cellText, minutes } = require('./lib-outline-course');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'sales-comms-course-1';
const blocks = readBlocks(path.join(SP, SLUG, 'outline', 'word', 'document.xml'));

const warn = [];
const map = {};
const meta = {};
const course = { title: '', instructor: '', los: {}, quizMinutes: null, quizClaimedQuestions: null };

let inCourse1 = false;
let mod = null, les = null;

for (const b of blocks) {
  if (b.type === 'p') {
    const t = b.text;
    let m;
    if (!t) continue;

    // Stated once for the whole program, before the Course 1 heading.
    if ((m = t.match(/^(?:Lead )?Instructor(?: Name)?\s*:\s*(.+)$/i)) && !course.instructor) {
      course.instructor = m[1].trim();
    }

    if (/^Course\s*1\b/i.test(t) && !inCourse1) { inCourse1 = true; mod = les = null; continue; }
    if (/^Course\s*[2-9]\b/i.test(t) && inCourse1) break;          // Course 1 only
    if (!inCourse1) continue;

    if ((m = t.match(/^Title of the Course\s*:\s*(.+)$/i))) { course.title = m[1].trim(); continue; }
    if ((m = t.match(/^(C1LO\d+)\s*:\s*(.+)$/i)))           { course.los[m[1]] = m[2].trim(); continue; }

    // Course-level tables; nothing in them belongs to a lesson.
    if (/^(Introduction to Course|Supplementary Items)/i.test(t)) { mod = les = null; continue; }

    if ((m = t.match(/^Module\s+(\d+)\s*$/i))) {
      mod = +m[1]; les = null;
      meta['M' + mod] = meta['M' + mod] || { title: '', alignedLOs: [], lessons: {} };
      continue;
    }
    if ((m = t.match(/^Title of the Module\s*:\s*(.+)$/i)) && mod) {
      meta['M' + mod].title = m[1].trim(); continue;
    }
    // "Aligned Course-level Learning Objective: C1LO1 — Analyze the cognitive and ..."
    if ((m = t.match(/^Aligned Course-level Learning Objective\s*:\s*(C1LO\d+)/i)) && mod) {
      meta['M' + mod].alignedLOs = [m[1].toUpperCase()]; continue;
    }
    if ((m = t.match(/^Lesson\s+(\d+)\s*$/i)) && mod) {
      les = +m[1];
      meta['M' + mod].lessons[les] = meta['M' + mod].lessons[les] || { title: '' };
      continue;
    }
    if ((m = t.match(/^Title of the Lesson\s*:\s*(.+)$/i)) && mod && les) {
      meta['M' + mod].lessons[les].title = m[1].trim(); continue;
    }
    continue;
  }

  if (!inCourse1) continue;
  const rows = b.rows.filter(r => r.length >= 2);
  if (!rows.length || !isItemHeader(rows[0])) continue;

  for (const cells of rows.slice(1)) {
    const [label, title, , desc, est] = cells.map(cellText);

    // The course's single graded assessment sits in the Supplementary Items table.
    if (/^graded\s*(quiz|assessment)/i.test(label)) {
      const v = minutes(est);
      if (v) course.quizMinutes = v;
      else warn.push('graded quiz row has no Est. Time');
      const q = (desc || '').match(/(\d+)\s*(?:multiple[- ]choice\s*)?questions?/i);
      if (q) course.quizClaimedQuestions = +q[1];
      continue;
    }

    if (!mod || !les) continue;
    const vm = label.match(/^Video\s+(\d+)$/i);          // "Intro Video" deliberately excluded
    if (!vm) continue;
    const key = 'M' + mod + 'L' + les + 'V' + vm[1];
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
  console.log('instructor: ' + (course.instructor || '(not stated)'));
  for (const k of Object.keys(meta)) {
    console.log('  ' + k + ' — ' + meta[k].title + '   [' + (meta[k].alignedLOs.join(',') || 'no LO') + ']');
    for (const l of Object.keys(meta[k].lessons)) {
      console.log('    L' + l + ': ' + meta[k].lessons[l].title);
      Object.keys(map).filter(x => x.startsWith(k + 'L' + l + 'V'))
        .forEach(v => console.log('       ' + v + '  ' + map[v].video));
    }
  }
  console.log('\ncourse LOs: ' + Object.keys(course.los).join(', '));
  console.log('graded quiz: ' + course.quizMinutes + ' mins, claims '
    + course.quizClaimedQuestions + ' questions');
  console.log('\n' + Object.keys(map).length + ' videos mapped · warnings: ' + warn.length);
  warn.forEach(w => console.log('  ' + w));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  console.log(JSON.stringify({ map, meta, course }, null, 2));
}
