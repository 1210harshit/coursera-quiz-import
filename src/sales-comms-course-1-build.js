// Rapport Mastery (Course 1) — quiz.json + outline.json -> one Assignment Import .docx.
//
//   node src/sales-comms-course-1-build.js <outDir>
//
// ONE document, thirty questions. The outline gives Course 1 a single "Graded Quiz" row of 30
// minutes in its Supplementary Items table rather than one per module, and the source quiz is
// one file headed "30 Questions | Three Modules". Questions are numbered 1-30 in document
// order; the source restarts at Q1 in each module section, which would hand the importer three
// Question 1s. The module a question came from is preserved in the traceability table at the
// end of the Guide Section.
const fs = require('fs');
const path = require('path');
const { zipDir } = require('./lib-zipwriter');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const SLUG = 'sales-comms-course-1';
const TMPL = path.join(SP, 'tmpl');
const OUT = process.argv[2];
if (!OUT) { console.error('usage: sales-comms-course-1-build.js <outDir>'); process.exit(2); }

const quiz = JSON.parse(fs.readFileSync(path.join(SP, SLUG, 'quiz.json'), 'utf8'));
const { map: VIDEOS, meta: MMETA, course: COURSE } =
  JSON.parse(fs.readFileSync(path.join(SP, SLUG, 'outline.json'), 'utf8'));

const OUT_NAME = 'Coursera_Import_Course_1_Graded_Quiz_Rapport_Mastery.docx';

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

// Explanations are used verbatim. This source writes no "Correct."/"Incorrect." verdict word in
// front of them — the verdict is carried by the row label, which the parser turned into the
// answer key — so there is nothing to strip.
function feedbackText(fb) {
  const t = String(fb == null ? '' : fb);
  if (!t.trim()) throw new Error('empty feedback');
  return t;
}

// "M1L3V1" -> "Refer to M1L3V1: Competence — The First Pillar"
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
  const sp = o.tight
    ? '<w:spacing w:after="0" w:before="0" w:line="240" w:lineRule="auto"/><w:ind w:left="0" w:firstLine="0"/>'
    : '';
  const body = (runs || []).map(r =>
    Array.isArray(r) ? run(r[0], r[1]) : (r && r.raw ? r.raw : run(r))).join('');
  return '<w:p><w:pPr>' + style + sp + rPr(o.run || {}) + '</w:pPr>' + body + '</w:p>';
}
const blank = () => para([]);

const grey = { color: GREY, i: true };
const H = (t, n) => para([[t]], { style: 'Heading' + n });
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

const nQ = quiz.questions.length;
const quizMins = COURSE.quizMinutes || 30;
const timeEst = String(Math.floor(quizMins / 60)).padStart(2, '0') + ':'
              + String(quizMins % 60).padStart(2, '0');
const LO_IDS = Object.keys(COURSE.los).sort();
const moduleList = quiz.modules.map(m => 'Module ' + m.number + ': ' + m.title).join(', ');

// ---------- body ----------
function buildBody() {
  const P = [];

  P.push(para([[COURSE.title + ' — Course 1 Graded Quiz']], { style: 'Title' }));
  P.push(note(['This document lets you import questions into the assignment that you create in ' +
    'Coursera. Learn more about ', link('assignments', REL.assignments)]));

  P.push(H('Getting started', 1));
  // NOTE: the marker lines read "Importable content starts here" / "End of importable content".
  // Like Coursera's own template, this guidance says "Imported content" instead, so the prose
  // can never be mistaken for a marker by the importer.
  P.push(note(['The questions for this quiz are in the ', link('Import Section', REL.examples),
    ' below, after the “Imported content starts here” line (and before the ' +
    '“End of imported content” line). This document contains all ' + nQ + ' graded questions for ' +
    'Course 1, drawn from ' + quiz.modules.length + ' modules: ' + moduleList + '.']));
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
  P.push(note(['To import, create the course graded quiz in Coursera, click ',
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

  for (const q of quiz.questions) {
    P.push(para([['Question ' + q.num + ' - multiple choice, shuffle']], { style: 'Heading4' }));
    // One paragraph, one plain run. No character formatting is carried over: the source colours
    // the correct option's letter green, and that colour is a source convention, not content.
    const prompt = String(q.prompt).trim();
    if (!prompt) throw new Error('empty prompt on question ' + q.num);
    // A single word followed by a colon is read by the importer as an answer option.
    if (/^[A-Za-z0-9]+\s*:\s/.test(prompt)) {
      throw new Error('prompt opens with a label token: ' + prompt.slice(0, 40));
    }
    P.push(para([[prompt]]));
    P.push(blank());

    const refer = referLine(q.mapped);
    for (const o of q.options) {
      const star = o.letter === q.correct ? '*' : '';
      P.push(para([[star + o.letter + ': ' + o.text]]));
      // Required layout — explanation and bracketed reference on ONE line. A free-standing
      // "Refer to ..." paragraph is an unmatched line and rejects the question.
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

  P.push(H('Core Information', 2));
  P.push(note(['For reference only. Modify as you like.']));
  P.push(para([['Instructor: ', { b: true }], [COURSE.instructor || '(not stated in the course outline)']]));
  P.push(para([['Course: ', { b: true }], [COURSE.title]]));
  P.push(para([['Scope: ', { b: true }],
    ['Whole course — ' + nQ + ' questions across ' + quiz.modules.length + ' modules.']]));
  P.push(para([['Assessment type: ', { b: true }],
    ['Graded quiz — counts towards the course grade.']]));

  P.push(H('Assignment Title', 2));
  P.push(para([['Course 1 Graded Quiz: ' + COURSE.title]]));

  P.push(H('Grading Settings', 2));
  P.push(note(['Choose the grading settings and policies for this assignment. Learn more about ',
    link('grading', REL.grading)]));

  const settings = [
    ['Grade to Save (Select with ‘*’)',
      ['Choose whether to use the learner’s highest or latest attempt as their grade.'],
      ['*Highest', 'Latest']],
    ['Assignment Type (Select with ‘*’)',
      ["If the assignment type is Team, you'll be able to create and assign teams after the assignment is published."],
      ['*Individual', 'Team']],
    ['Time Estimate (hh:mm)', [], [timeEst]],
    ['Passing Threshold', [], ['80%']],
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
    } else if (notes && notes.length) {
      P.push(note([notes[0]]));
    }
    vals.forEach(v => P.push(para([[v]])));
  }

  P.push(H('Instructions for Learners', 2));
  P.push(note(['Create instructions for learners. Learn more about ',
    link('instructions', REL.instructions)]));

  P.push(H('Learning objectives', 4));
  P.push(note(['Assessments are used to measure learners\' mastery of the course learning objectives. ' +
    'Here, you can indicate which learning objectives are associated with this assessment. Learn more about ',
    link('learning objectives', REL.objectives)]));
  // The quiz covers the whole course, so every course-level objective is in scope.
  if (!LO_IDS.length) P.push(para([['No course learning objectives are stated in the outline.']]));
  LO_IDS.forEach((id, i) => {
    P.push(H('Learning Objective ' + (i + 1), 4));
    P.push(para([[id + ': ' + COURSE.los[id]]]));
  });

  P.push(H('Instructions overview', 4));
  P.push(para([['This graded quiz assesses your understanding of the whole of ' + COURSE.title +
    '. It contains ' + nQ + ' multiple-choice questions drawn from every video in the course, ' +
    'across ' + quiz.modules.length + ' modules. Select the single best answer for each question. ' +
    'Answer options are shuffled, so they may appear in a different order than a classmate sees. ' +
    'You need a score of 80% or higher to pass, and you may retake the quiz as many times as you ' +
    'need — your highest score is the one that counts. After you submit, you will see feedback on ' +
    'every option along with the specific lesson video to revisit.']]));

  P.push(H('Review Criteria Summary', 4));
  P.push(para([['Each question is worth 1 point, for a total of ' + nQ + ' points. All questions ' +
    'are auto-graded, so your score is available as soon as you submit. A score of 80% or higher (' +
    Math.ceil(nQ * 0.8) + ' of ' + nQ + ') is required to pass. Feedback is released immediately ' +
    'and includes an explanation for every option plus a reference to the lesson video that covers it.']]));

  P.push(H('Instructions for Graders', 2));
  P.push(note(['Create instructions for graders. Learn more about ',
    link('instructions', REL.instructions2)]));
  P.push(H('Instructions (not shown to learners)', 4));
  P.push(note(['Provide a general summary of the grading criteria that’s only visible to graders']));
  P.push(para([['No manual grading is required. All ' + nQ + ' questions are auto-graded multiple ' +
    'choice with a single correct answer worth 1 point each. The answer key, the source module and ' +
    'the video mapped to each question are listed under “Working area for question design” at the ' +
    'end of this document.']]));

  P.push(H('Assignment Rubrics', 4));
  P.push(note(['You may want to include a rubric, or scoring, element that isn’t directly tied to a ' +
    'specific prompt, but rather applies to the whole assignment. Learn more about ',
    link('rubrics', REL.rubrics)]));
  P.push(para([['Not applicable. Rubrics apply to manual-graded questions only, and every question ' +
    'in this quiz is auto-graded.']]));

  P.push(H('Working area for question design', 2));
  P.push(note(['You can use this as a working area to design your questions here but they won’t be ' +
    'imported. Only questions in the Import Section of this doc will be imported.']));
  P.push(blank());
  P.push(note(['Traceability for each imported question. "Source" is the module section and question ' +
    'number as written in the assessment document, before renumbering. The Key column reflects the ' +
    'option order in this document; because shuffle is enabled, learners may see a different order.']));
  const rows = [{ head: true, cells: [['Q#'], ['Source'], ['Mapped to'], ['Video referenced in feedback'], ['Key']] }];
  for (const q of quiz.questions) {
    const v = VIDEOS[q.mapped];
    rows.push({ cells: [['Q' + q.num], ['M' + q.module + ' Q' + q.srcNum], [q.mapped],
      ['Module ' + v.module + ' Lesson ' + v.lesson + ': ' + v.video], [q.correct]] });
  }
  P.push(table(rows, [620, 900, 1100, 4660, 620]));
  P.push(blank());

  return P.join('');
}

// ---------- package writer ----------
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
  '<w:body>' + buildBody() + sectPr + '</w:body></w:document>';
fs.writeFileSync(path.join(stage, 'word', 'document.xml'), doc, 'utf8');

fs.mkdirSync(OUT, { recursive: true });
const outPath = path.join(OUT, OUT_NAME);
try {
  fs.rmSync(outPath, { force: true });
  zipDir(stage, outPath);
} catch (err) {
  if (err.code !== 'EPERM' && err.code !== 'EBUSY') throw err;
  console.log('LOCKED ' + OUT_NAME + '  (open in another application — not overwritten)');
  process.exitCode = 2;
}
fs.rmSync(stage, { recursive: true, force: true });

if (!process.exitCode) {
  console.log('WROTE  ' + OUT_NAME + '  (' + nQ + ' questions, ' + fs.statSync(outPath).size + ' bytes)');
  console.log('  1 document · whole-course graded quiz · ' + quiz.modules.length + ' module sections · '
    + timeEst + ' time estimate');
}
