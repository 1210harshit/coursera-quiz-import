// Bridging the Soft Skills Gap — quiz.json + outline.json -> one Assignment Import .docx per quiz.
//
//   node src/bridging-soft-skills-build.js <outDir>
//
// Twelve documents: four module graded quizzes and eight lesson practice quizzes. Both kinds
// use Coursera's Assignment Import Template and the same import grammar — a practice quiz is a
// quiz item whose result does not count, not a different file format. What differs is the
// Grading Settings block and the wording of the learner-facing instructions, both of which are
// driven by `kind` below.
const fs = require('fs');
const path = require('path');
const { zipDir } = require('./lib-zipwriter');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'bridging-soft-skills';
const TMPL = path.join(SP, 'tmpl');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: bridging-soft-skills-build.js <outDir>'); process.exit(2); }

const quizzes = JSON.parse(fs.readFileSync(path.join(SP, SLUG, 'quiz.json'), 'utf8'));
const { map: VIDEOS, meta: MMETA, course: COURSE } =
  JSON.parse(fs.readFileSync(path.join(SP, SLUG, 'outline.json'), 'utf8'));

const FONT = 'Source Sans Pro';
const GREY = '706f6f';
const LINK = '1155cc';

// Hyperlink relationship ids already present in the template package.
const REL = {
  assignments: 'rId7', examples: 'rId8', backwards: 'rId9', backwards2: 'rId10',
  grading: 'rId11', hideGrades: 'rId12', plagiarism: 'rId13',
  instructions: 'rId14', objectives: 'rId15', instructions2: 'rId16', rubrics: 'rId17',
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                          .replace(/"/g, '&quot;');

// Feedback is used verbatim. Unlike the OSHA and CSTP sources this one writes no
// "Correct." / "Incorrect." verdict word in front of the explanation, so there is nothing to
// strip — and stripping speculatively would eat a legitimate opening word.
function feedbackText(fb) {
  const t = String(fb == null ? '' : fb);
  if (!t.trim()) throw new Error('empty feedback');
  return t;
}

// "M1L3V1" -> "Refer to M1L3V1: Reading the Room: Teaching Respect for Context"
function referLine(mapped) {
  const v = VIDEOS[mapped];
  if (!v) throw new Error('No video in outline for mapping ' + mapped);
  return 'Refer to ' + mapped + ': ' + v.video;
}

// ---------- OOXML helpers ----------
function rPr(o) {
  o = o || {};
  let s = '<w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/>';
  if (o.b) s += '<w:b w:val="1"/><w:bCs w:val="1"/>';
  if (o.i) s += '<w:i w:val="1"/><w:iCs w:val="1"/>';
  if (o.color) s += '<w:color w:val="' + o.color + '"/>';
  if (o.u) s += '<w:u w:val="single"/>';
  if (o.sz) s += '<w:sz w:val="' + o.sz + '"/><w:szCs w:val="' + o.sz + '"/>';
  return '<w:rPr>' + s + '<w:rtl w:val="0"/></w:rPr>';
}
function run(text, o) {
  return '<w:r>' + rPr(o) + '<w:t xml:space="preserve">' + esc(text) + '</w:t></w:r>';
}
function link(text, rel) {
  return { raw: '<w:hyperlink r:id="' + rel + '">' + run(text, { color: LINK, u: true }) + '</w:hyperlink>' };
}
function para(runs, o) {
  o = o || {};
  const style = o.style ? '<w:pStyle w:val="' + o.style + '"/>' : '';
  // o.tight: single line spacing. o.gapAfter: visual space below the paragraph, done with
  // paragraph spacing rather than an empty paragraph — a blank line inside a prompt would
  // terminate it for the importer.
  const sp = o.tight
    ? '<w:spacing w:after="0" w:before="0" w:line="240" w:lineRule="auto"/><w:ind w:left="0" w:firstLine="0"/>'
    : o.gapAfter
    ? '<w:spacing w:after="200" w:before="0" w:line="276" w:lineRule="auto"/><w:ind w:left="0" w:firstLine="0"/>'
    : '';
  const body = (runs || []).map(r =>
    Array.isArray(r) ? run(r[0], r[1]) : (r && r.raw ? r.raw : run(r))).join('');
  return '<w:p><w:pPr>' + style + sp + rPr(o.run || {}) + '</w:pPr>' + body + '</w:p>';
}
const blank = () => para([]);

const grey = { color: GREY, i: true };
const H = (t, n) => para([[t]], { style: 'Heading' + n });
// Plain strings take the grey guidance style; [text, opts] pairs and raw runs pass straight
// through — wrapping a raw run in a pair would stringify it.
const note = runs => para(runs.map(r =>
  (Array.isArray(r) || (r && r.raw)) ? r : [r, grey]), { run: grey });

function cell(runs, o) {
  o = o || {};
  const w = o.w ? '<w:tcW w:type="dxa" w:w="' + o.w + '"/>' : '';
  const shd = o.shd ? '<w:shd w:fill="' + o.shd + '" w:val="clear"/>' : '';
  const bd = '<w:tcBorders>' + ['top', 'left', 'bottom', 'right']
    .map(s => '<w:' + s + ' w:color="cfcfcf" w:space="0" w:sz="6" w:val="single"/>').join('') + '</w:tcBorders>';
  return '<w:tc><w:tcPr>' + w + bd + shd + '<w:vAlign w:val="center"/></w:tcPr>' +
    para(runs, { run: o.run }) + '</w:tc>';
}
function table(rows, widths) {
  const grid = '<w:tblGrid>' + widths.map(w => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>';
  const pr = '<w:tblPr><w:tblStyle w:val="TableNormal"/>' +
    '<w:tblW w:type="dxa" w:w="' + widths.reduce((a, b) => a + b, 0) + '"/>' +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map(s => '<w:' + s + ' w:color="cfcfcf" w:space="0" w:sz="6" w:val="single"/>').join('') +
    '</w:tblBorders></w:tblPr>';
  const body = rows.map(r =>
    '<w:tr>' + r.cells.map((c, i) =>
      cell(c, { w: widths[i], shd: r.head ? 'eef2f7' : null, run: r.head ? { b: true } : {} })
    ).join('') + '</w:tr>').join('');
  return '<w:tbl>' + pr + grid + body + '</w:tbl>';
}

const tmplDoc = fs.readFileSync(path.join(TMPL, 'word', 'document.xml'), 'utf8');
const sectPr = (tmplDoc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/) || ['<w:sectPr/>'])[0];

const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

/** Everything that differs between a graded quiz and a practice quiz, in one place. */
function profile(z) {
  const m = MMETA['M' + z.module];
  const graded = z.kind === 'graded';
  const lesson = graded ? null : m.lessons[z.lesson];
  return {
    graded,
    modTitle: m.title,
    lesTitle: lesson ? lesson.title : null,
    // The quiz's own scope decides which objectives it is measuring: a module quiz covers the
    // module's six, a lesson practice quiz covers that lesson's three.
    objectives: graded ? m.objectives : (lesson ? lesson.objectives : []),
    minutes: graded
      ? (COURSE.gradedMinutes['M' + z.module] || 20)
      : (COURSE.practiceMinutes['M' + z.module + 'L' + z.lesson] || 5),
    label: graded
      ? 'Module ' + z.module + ' Graded Quiz'
      : 'Module ' + z.module + ' Lesson ' + z.lesson + ' Practice Quiz',
    scope: graded
      ? 'Module ' + z.module + ': ' + m.title
      : 'Lesson ' + z.lesson + ': ' + (lesson ? lesson.title : ''),
    file: graded
      ? 'Coursera_Import_Module_' + z.module + '_Graded_Quiz_Bridging_Soft_Skills.docx'
      : 'Coursera_Import_Module_' + z.module + '_Lesson_' + z.lesson +
        '_Practice_Quiz_Bridging_Soft_Skills.docx',
  };
}

// ---------- build one quiz, following the template's section order ----------
function buildBody(z) {
  const P = [];
  const p = profile(z);
  const nQ = z.questions.length;
  const timeEst = hhmm(p.minutes);

  // ---- Title + intro ----
  P.push(para([[COURSE.title + ' — ' + p.label]], { style: 'Title' }));
  P.push(note(['This document lets you import questions into the assignment that you create in ' +
    'Coursera. Learn more about ', link('assignments', REL.assignments)]));

  // ---- Getting started ----
  P.push(H('Getting started', 1));
  // NOTE: the marker lines read "Importable content starts here" / "End of importable content".
  // Like Coursera's own template, this guidance deliberately says "Imported content" instead,
  // so the prose can never be mistaken for a marker by the importer.
  P.push(note(['The questions for this quiz are in the ', link('Import Section', REL.examples),
    ' below, after the “Imported content starts here” line (and before the ' +
    '“End of imported content” line). This document contains all ' + nQ + ' ' +
    (p.graded ? 'graded' : 'practice') + ' questions for ' + p.scope + '.']));
  P.push(blank());
  P.push(note([['This template is completely flexible and customizable', { color: '666666', i: true }],
    ['. Here are some examples of how you can customize this template:']]));
  P.push(note(['• You can move sections around (just don’t delete the “Imported content starts ' +
    'here” and “end of imported content” lines).']));
  P.push(note(['• You can add or delete sections or subsections.']));
  P.push(note(['• You can add any other content you like such as “document status” to help with ' +
    'project management aspects.']));
  P.push(note(['• You can change the assessment name or document name.']));
  P.push(blank());
  P.push(note(['To be imported properly, the questions must match the formatting guidelines ' +
    'provided here and in the ', link('example questions', REL.examples),
    ' reference. The Guide Section in this document outlines the other attributes that you can ' +
    'include in the template.']));
  P.push(blank());
  P.push(note(['To import, create a new ' + (p.graded ? 'graded quiz' : 'practice quiz') +
    ' in Module ' + z.module + ' of your Coursera course, click ',
    ['Import', { b: true, color: GREY, i: true }],
    ', and follow the prompts to upload this file. Any content that you import can be edited on ' +
    'Coursera later.']));
  P.push(blank());
  P.push(note([['💡 ', { color: '1f1f1f' }], ['Tip:', { b: true, color: '666666', i: true }],
    [' What you write in the Guide Section won’t be imported, but can be used for your own reference.']]));
  P.push(blank());

  // ---- Import Section ----
  P.push(H('Import Section', 1));
  P.push(para([['----- Importable content starts here -----', grey]], { style: 'Heading3', run: grey }));
  P.push(blank());

  for (const q of z.questions) {
    P.push(para([['Question ' + q.num + ' - multiple choice, shuffle']], { style: 'Heading4' }));
    // The prompt is one paragraph, one plain run. The parser already joined a scenario's two
    // source paragraphs and dropped the "Scenario:" label, which the importer would otherwise
    // read as an answer option. No character formatting is carried over: all imported quiz
    // content is plain text.
    const prompt = String(q.prompt).trim();
    if (/^[A-Za-z][A-Za-z ]{0,24}:\s/.test(prompt)) {
      throw new Error('prompt starts with a label-like token: ' + prompt.slice(0, 40));
    }
    if (!prompt) throw new Error('empty prompt on question ' + q.num);
    P.push(para([[prompt]]));
    P.push(blank());

    const refer = referLine(q.mapped);
    for (const o of q.options) {
      const star = o.letter === q.correct ? '*' : '';
      P.push(para([[star + o.letter + ': ' + o.text]]));
      // Required layout — explanation and bracketed reference on ONE line:
      //   Feedback: <explanation> (Refer to M1L1V1: <title>)
      // One paragraph, one run, no line breaks: a free-standing "Refer to ..." paragraph is an
      // unmatched line and rejects the question.
      P.push(para([['Feedback: ' + feedbackText(q.feedback[o.letter]) + ' (' + refer + ')']]));
      P.push(blank());
    }
  }

  P.push(para([['----- End of importable content -----', grey]], { style: 'Heading3', run: grey }));
  P.push(blank());
  P.push(blank());

  // ---- Reference-only remainder ----
  P.push(H('****The following content is for your reference and will not be imported.****', 3));
  P.push(blank());

  P.push(H('Guide Section', 1));
  P.push(para([['You can use the remainder of this document to design this assignment. This can be ' +
    'helpful when using '], link('backwards design principles', REL.backwards), ['.']]));

  // Core Information
  P.push(H('Core Information', 2));
  P.push(note(['For reference only. Modify as you like.']));
  P.push(para([['Instructor: ', { b: true }], [COURSE.instructor || '(not stated in the course outline)']]));
  P.push(para([['Course: ', { b: true }], [COURSE.title]]));
  P.push(para([['Module: ', { b: true }], ['Module ' + z.module + ' — ' + p.modTitle]]));
  if (!p.graded) P.push(para([['Lesson: ', { b: true }], ['Lesson ' + z.lesson + ' — ' + p.lesTitle]]));
  P.push(para([['Assessment type: ', { b: true }],
    [p.graded ? 'Graded quiz — counts towards the course grade.'
              : 'Practice quiz — ungraded retrieval practice, does not count towards the course grade.']]));

  // Assignment Title
  P.push(H('Assignment Title', 2));
  P.push(para([[p.graded
    ? 'Module ' + z.module + ' Graded Quiz: ' + p.modTitle
    : 'Practice Quiz: ' + p.lesTitle]]));

  // Grading Settings
  P.push(H('Grading Settings', 2));
  P.push(note(['Choose the grading settings and policies for this assignment. Learn more about ',
    link('grading', REL.grading)]));

  // A practice quiz is ungraded: there is no threshold to clear and nothing to gate, so the
  // threshold is 0% and attempts stay unlimited. Everything else matches the graded settings,
  // because the learner-facing behaviour — shuffle, full feedback, visible responses — is what
  // makes retrieval practice work.
  const settings = [
    ['Grade to Save (Select with ‘*’)',
      ['Choose whether to use the learner’s highest or latest attempt as their grade.'],
      ['*Highest', 'Latest']],
    ['Assignment Type (Select with ‘*’)',
      ["If the assignment type is Team, you'll be able to create and assign teams after the assignment is published."],
      ['*Individual', 'Team']],
    ['Time Estimate (hh:mm)', [], [timeEst]],
    ['Passing Threshold', [], [p.graded ? '80%' : '0%']],
    ['Feedback Type (Select with ‘*’)',
      ['Feedback will be shown to learners when grades are released. Select from the following:'],
      ['*Full - Learners see everything included in Limited plus options and feedback.',
       'Partial - Learners see overall percentage and number of points, correct/incorrect status and total number of points for each question, and rubrics.',
       'Limited - Learners only see their overall percentage and number of points.']],
    ['Learner Grade Visibility (Select with ‘*’)', null, ['*Visible', 'Hidden']],
    ['Learner Response Visibility (Select with ‘*’)',
      ['Choose whether or not a learner can see their responses after the quiz is graded.'],
      ['*Visible', 'Hidden']],
    ['Maximum Number of Attempts',
      ['Enter the maximum number of attempts allowed. Enter ‘0’ for no maximum.'], ['0']],
    ['Time Limit Per Attempt (hh:mm)',
      ['Use if the maximum number of attempts is greater than 0. Enter ‘0’ or ‘00:00’ for no maximum.'],
      ['00:00']],
    ['Maximum Number of Submissions Per Timed Attempt',
      ['Use if the time limit is greater than 0:00. Enter ‘0’ for no maximum.'], ['0']],
    ['Plagiarism Detection (Select with ‘*’)',
      ['FOR DEGREE COURSES. Contact your Degree Program Manager at Coursera to make sure you can use it. Learn more about '],
      ['*Disabled', 'Enabled']],
  ];
  for (const [head, notes, vals] of settings) {
    P.push(H(head, 4));
    if (head.startsWith('Learner Grade Visibility')) {
      P.push(note([link('Learner grade visibility', REL.hideGrades),
        ' determines if an individual learner can see their grade as it’s available. Learn more about ',
        link('hiding grades from learners', REL.hideGrades)]));
    } else if (head.startsWith('Plagiarism')) {
      P.push(note([notes[0], link('plagiarism detection', REL.plagiarism)]));
    } else if (head.startsWith('Passing Threshold') && !p.graded) {
      P.push(note(['This is a practice quiz. It is ungraded and does not gate progress, so no ' +
        'threshold has to be cleared.']));
    } else if (notes && notes.length) {
      P.push(note([notes[0]]));
    }
    vals.forEach(v => P.push(para([[v]])));
  }

  // Instructions for Learners
  P.push(H('Instructions for Learners', 2));
  P.push(note(['Create instructions for learners. Learn more about ',
    link('instructions', REL.instructions)]));

  P.push(H('Learning objectives', 4));
  P.push(note(['Assessments are used to measure learners\' mastery of the course learning objectives. ' +
    'Here, you can indicate which learning objectives are associated with this assessment. Learn more about ',
    link('learning objectives', REL.objectives)]));
  if (!p.objectives.length) {
    P.push(para([['No objectives are stated for this scope in the course outline.']]));
  }
  p.objectives.forEach((lo, i) => {
    P.push(H('Learning Objective ' + (i + 1), 4));
    P.push(para([[lo]]));
  });

  P.push(H('Instructions overview', 4));
  P.push(para([[p.graded
    ? 'This graded quiz assesses your understanding of Module ' + z.module + ': ' + p.modTitle +
      '. It contains ' + nQ + ' multiple-choice questions drawn from all ' +
      Object.keys(MMETA['M' + z.module].lessons).length + ' lessons in the module. Select the ' +
      'single best answer for each question. Answer options are shuffled, so they may appear in ' +
      'a different order than a classmate sees. You need a score of 80% or higher to pass, and ' +
      'you may retake the quiz as many times as you need — your highest score is the one that ' +
      'counts. After you submit, you will see feedback on every option along with the specific ' +
      'lesson video to revisit.'
    : 'This practice quiz gives you low-stakes retrieval practice on Lesson ' + z.lesson + ': ' +
      p.lesTitle + ', before the graded assessment at the end of Module ' + z.module + '. It ' +
      'contains ' + nQ + ' multiple-choice questions covering the videos in this lesson. Select ' +
      'the single best answer for each question. Answer options are shuffled, so they may appear ' +
      'in a different order than a classmate sees. The quiz is ungraded and does not count ' +
      'towards your course grade, and you may retake it as often as you like. After you submit, ' +
      'you will see feedback on every option along with the specific lesson video to revisit.']]));

  P.push(H('Review Criteria Summary', 4));
  P.push(para([[p.graded
    ? 'Each question is worth 1 point, for a total of ' + nQ + ' points. All questions are ' +
      'auto-graded, so your score is available as soon as you submit. A score of 80% or higher (' +
      Math.ceil(nQ * 0.8) + ' of ' + nQ + ') is required to pass. Feedback is released ' +
      'immediately and includes an explanation for every option plus a reference to the lesson ' +
      'video that covers it.'
    : 'All ' + nQ + ' questions are auto-graded, so your result is available as soon as you ' +
      'submit. Nothing has to be passed here: the score is for your own diagnosis, and the value ' +
      'is in the feedback, which explains every option and points to the lesson video that ' +
      'covers it. Use it to decide what to review before the module graded assessment.']]));

  // Instructions for Graders
  P.push(H('Instructions for Graders', 2));
  P.push(note(['Create instructions for graders. Learn more about ',
    link('instructions', REL.instructions2)]));
  P.push(H('Instructions (not shown to learners)', 4));
  P.push(note(['Provide a general summary of the grading criteria that’s only visible to graders']));
  P.push(para([['No manual grading is required. All ' + nQ + ' questions are auto-graded multiple ' +
    'choice with a single correct answer worth 1 point each. The answer key and the video mapped ' +
    'to each question are listed under “Working area for question design” at the end of this ' +
    'document.' + (p.graded ? '' : ' This is a practice quiz and does not contribute to the ' +
    'course grade.')]]));

  P.push(H('Assignment Rubrics', 4));
  P.push(note(['You may want to include a rubric, or scoring, element that isn’t directly tied to a ' +
    'specific prompt, but rather applies to the whole assignment. Learn more about ',
    link('rubrics', REL.rubrics)]));
  P.push(para([['Not applicable. Rubrics apply to manual-graded questions only, and every question ' +
    'in this quiz is auto-graded.']]));

  // Working area for question design
  P.push(H('Working area for question design', 2));
  P.push(note(['You can use this as a working area to design your questions here but they won’t be ' +
    'imported. Only questions in the Import Section of this doc will be imported.']));
  P.push(blank());
  P.push(note(['Traceability for each imported question. The Key column reflects the option order in ' +
    'this document; because shuffle is enabled, learners may see the options in a different order.']));
  const rows = [{ head: true, cells: [['Q#'], ['Mapped to'], ['Video referenced in feedback'], ['Key']] }];
  for (const q of z.questions) {
    const v = VIDEOS[q.mapped];
    rows.push({ cells: [['Q' + q.num], [q.mapped],
      ['Module ' + v.module + ' Lesson ' + v.lesson + ': ' + v.video], [q.correct]] });
  }
  P.push(table(rows, [620, 1100, 5560, 620]));
  P.push(blank());

  return P.join('');
}

// ---------- package writer ----------
function writeDocx(z, outPath) {
  const stage = path.join(SP, 'stage');
  fs.rmSync(stage, { recursive: true, force: true });
  fs.cpSync(TMPL, stage, { recursive: true });

  // Drop the comments part: the template's margin tips do not apply to a generated file.
  fs.rmSync(path.join(stage, 'word', 'comments.xml'), { force: true });
  const ctPath = path.join(stage, '[Content_Types].xml');
  fs.writeFileSync(ctPath, fs.readFileSync(ctPath, 'utf8')
    .replace(/<Override[^>]*comments\.xml"\/>/g, ''));
  const relPath = path.join(stage, 'word', '_rels', 'document.xml.rels');
  fs.writeFileSync(relPath, fs.readFileSync(relPath, 'utf8')
    .replace(/<Relationship[^>]*Target="comments\.xml"[^>]*\/>/g, ''));

  const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">' +
    '<w:body>' + buildBody(z) + sectPr + '</w:body></w:document>';
  fs.writeFileSync(path.join(stage, 'word', 'document.xml'), doc, 'utf8');

  fs.rmSync(outPath, { force: true });
  zipDir(stage, outPath);
  fs.rmSync(stage, { recursive: true, force: true });
  return outPath;
}

fs.mkdirSync(OUT, { recursive: true });
const locked = [];
let nQ = 0;
for (const z of quizzes) {
  const p = profile(z);
  try {
    const out = writeDocx(z, path.join(OUT, p.file));
    nQ += z.questions.length;
    console.log('WROTE  ' + p.file.padEnd(66) + ' (' + z.questions.length + ' questions, ' +
      fs.statSync(out).size + ' bytes)');
  } catch (err) {
    if (err.code !== 'EPERM' && err.code !== 'EBUSY') throw err;
    locked.push(p.file);
    console.log('LOCKED ' + p.file + '  (open in another application — not overwritten)');
  }
}
const g = quizzes.filter(z => z.kind === 'graded').length;
console.log('\n' + quizzes.length + ' documents · ' + g + ' graded · ' + (quizzes.length - g) +
  ' practice · ' + nQ + ' questions');
if (locked.length) {
  console.log('\nSTILL LOCKED: ' + locked.join(', '));
  process.exitCode = 2;
}
