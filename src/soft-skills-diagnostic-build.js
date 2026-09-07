// Builder for the Soft Skills for Work and Life graded assessments — one Assignment Import
// .docx per module, four in all.
//
// The same builder as ai-products', which is genai-pm's apart from stripVerdict below: this
// source states the verdict as part of the explanation's LETTER LABEL
// ("Explanation for Option C (Correct):"), which the parser consumes along with the label
// itself, so the stored text arrives already clean.
//
// Every prompt here is a SINGLE line. Five of the forty are scenarios, and this source writes
// that label on the question header ("Q1. Scenario:") with the scenario in the paragraph below,
// so the parser consumes the label as the structure it is and the prompt reaches the builder
// with nothing to strip. The Scenario: strip below therefore never fires on this course; it is
// kept because it is not optional for a source that writes the label inline — the importer
// reads a line beginning `word:` as an answer option, which is what rejected every scenario
// question on osha.
const fs = require('fs');
const path = require('path');
const { zipDir } = require('./lib-zipwriter');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const TMPL = path.join(SP, 'tmpl');
const OUT = process.argv[2];
const mods = JSON.parse(fs.readFileSync(path.join(SP, 'soft-skills', 'diagnostic.json'), 'utf8'));
const { map: VIDEOS, meta: MMETA, course: COURSE } =
  JSON.parse(fs.readFileSync(path.join(SP, 'soft-skills', 'outline.json'), 'utf8'));

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

// This source states the verdict inside the explanation's letter label — "B (Correct): …" —
// which the parser consumes together with the label, so the stored text is already clean.
// The strip is kept as a guard against a future revision writing the verdict inline instead,
// in either the bare form the osha source used or the bracketed form paid-social uses.
// Coursera already shows the learner whether their option was right, so either would only
// repeat the interface. Removes the marker and the whitespace after it, nothing else.
function stripVerdict(fb) {
  const out = String(fb).replace(/^(?:\((?:Correct|Incorrect)\)|(?:Correct|Incorrect)[.:,!])\s*/i, '');
  if (!out.trim()) throw new Error('feedback empty after stripping verdict: ' + fb);
  return out;
}

// The diagnostic runs BEFORE any video is watched, so its feedback cannot point at one. It
// points at the module the question is drawn from, which is also what the diagnostic is for:
// routing the learner to where their attention is most needed.
//   1 -> "Refer to Module 1: Laying Down a Solid Foundation: Soft Skills, Attitude, and Character"
// The module title passes through verbatim — no whitespace normalisation.
function referLine(module) {
  const m = MMETA['M' + module];
  if (!m) throw new Error('No module in outline for ' + module);
  return `Refer to Module ${module}: ${m.title}`;
}

// ---------- OOXML helpers ----------
function rPr(o = {}) {
  let s = `<w:rFonts w:ascii="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}" w:hAnsi="${FONT}"/>`;
  if (o.b) s += '<w:b w:val="1"/><w:bCs w:val="1"/>';
  if (o.i) s += '<w:i w:val="1"/><w:iCs w:val="1"/>';
  if (o.color) s += `<w:color w:val="${o.color}"/>`;
  if (o.u) s += '<w:u w:val="single"/>';
  if (o.sz) s += `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>`;
  return `<w:rPr>${s}<w:rtl w:val="0"/></w:rPr>`;
}
function run(text, o = {}) {
  return `<w:r>${rPr(o)}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}
// Line breaks WITHIN a paragraph. Two breaks render as one blank line, while the
// whole block stays a single paragraph so the importer keeps it with its option.
function brk(n = 1, o = {}) {
  return { raw: `<w:r>${rPr(o)}${'<w:br/>'.repeat(n)}</w:r>` };
}
function link(text, rel) {
  return { raw: `<w:hyperlink r:id="${rel}">${run(text, { color: LINK, u: true })}</w:hyperlink>` };
}
function para(runs, o = {}) {
  const style = o.style ? `<w:pStyle w:val="${o.style}"/>` : '';
  // o.tight: single line spacing, no space before/after. Used for the feedback block so the
  // blank line above the reference is exactly one line high, not the document's 1.15 default.
  // o.gapAfter: visual space below the paragraph, achieved with paragraph spacing rather
  // than an empty paragraph — an empty line inside a prompt could terminate it for the importer.
  const sp = o.tight
    ? '<w:spacing w:after="0" w:before="0" w:line="240" w:lineRule="auto"/><w:ind w:left="0" w:firstLine="0"/>'
    : o.gapAfter
    ? '<w:spacing w:after="200" w:before="0" w:line="276" w:lineRule="auto"/><w:ind w:left="0" w:firstLine="0"/>'
    : '';
  const body = (runs || []).map(r =>
    Array.isArray(r) ? run(r[0], r[1]) : (r && r.raw ? r.raw : run(r))).join('');
  return `<w:p><w:pPr>${style}${sp}${rPr(o.run || {})}</w:pPr>${body}</w:p>`;
}
const blank = () => para([]);

// section helpers matching the template's own voice
const grey = { color: GREY, i: true };
const H = (t, n) => para([[t]], { style: 'Heading' + n });
// Plain strings get the grey guidance style; [text, opts] pairs and raw runs (e.g. links)
// pass straight through — wrapping a raw run in a pair would stringify it.
const note = runs => para(runs.map(r =>
  (Array.isArray(r) || (r && r.raw)) ? r : [r, grey]), { run: grey });

function cell(runs, o = {}) {
  const w = o.w ? `<w:tcW w:type="dxa" w:w="${o.w}"/>` : '';
  const shd = o.shd ? `<w:shd w:fill="${o.shd}" w:val="clear"/>` : '';
  const bd = `<w:tcBorders>${['top', 'left', 'bottom', 'right']
    .map(s => `<w:${s} w:color="cfcfcf" w:space="0" w:sz="6" w:val="single"/>`).join('')}</w:tcBorders>`;
  return `<w:tc><w:tcPr>${w}${bd}${shd}<w:vAlign w:val="center"/></w:tcPr>${para(runs, { run: o.run })}</w:tc>`;
}
function table(rows, widths) {
  const grid = `<w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const pr = `<w:tblPr><w:tblStyle w:val="TableNormal"/>` +
    `<w:tblW w:type="dxa" w:w="${widths.reduce((a, b) => a + b, 0)}"/>` +
    `<w:tblLayout w:type="fixed"/>` +
    `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map(s => `<w:${s} w:color="cfcfcf" w:space="0" w:sz="6" w:val="single"/>`).join('')}</w:tblBorders>` +
    `</w:tblPr>`;
  const body = rows.map(r =>
    `<w:tr>${r.cells.map((c, i) =>
      cell(c, { w: widths[i], shd: r.head ? 'eef2f7' : null, run: r.head ? { b: true } : {} })
    ).join('')}</w:tr>`).join('');
  return `<w:tbl>${pr}${grid}${body}</w:tbl>`;
}

const tmplDoc = fs.readFileSync(path.join(TMPL, 'word', 'document.xml'), 'utf8');
const sectPr = (tmplDoc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/) || ['<w:sectPr/>'])[0];

// ---------- build one module, following the template's section order ----------
function buildBody(mo) {
  const P = [];
  // The diagnostic belongs to no single module: it samples all of them, so every module's
  // aligned objective is in scope and the heading names the course rather than a module.
  const modTitle = mo.title;
  const los = [...new Set(Object.keys(MMETA)
    .sort((a, b) => +a.slice(1) - +b.slice(1))
    .flatMap(k => MMETA[k].alignedLOs || (MMETA[k].alignedLO ? [MMETA[k].alignedLO] : [])))];
  const nQ = mo.questions.length;
  // Derive minutes per question from the outline's own quiz budget rather than splitting
  // the total across modules — the outline budgets for more questions than the quiz has.
  const perQ = COURSE.quizClaimedQuestions
    ? COURSE.quizMinutes / COURSE.quizClaimedQuestions
    : COURSE.quizMinutes / mods.reduce((a, x) => a + x.questions.length, 0);
  const quizMins = Math.max(5, Math.round(nQ * perQ));
  const timeEst = `${String(Math.floor(quizMins / 60)).padStart(2, '0')}:` +
                  `${String(quizMins % 60).padStart(2, '0')}`;

  // ---- Title + intro (template lines 1-2) ----
  P.push(para([[`${COURSE.title} — ${mo.title}`]], { style: 'Title' }));
  P.push(note(['This document lets you import questions into the assignment that you create in ' +
    'Coursera. Learn more about ', link('assignments', REL.assignments)]));

  // ---- Getting started (template Heading1) ----
  P.push(H('Getting started', 1));
  // NOTE: the marker lines are "Importable content starts here" / "End of importable content".
  // Like the original template, this guidance says "Imported content" instead, so the prose can
  // never be mistaken for the markers themselves by the importer.
  P.push(note([`The questions for this quiz are in the `, link('Import Section', REL.examples),
    ` below, after the “Imported content starts here” line (and before the ` +
    `“End of imported content” line). This document contains all ${nQ} diagnostic questions, ` +
    `drawn from every module of the course.`]));
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
  P.push(note(['To import, create the pre-course diagnostic quiz item that sits before Module 1 of ' +
    'your Coursera course, click ',
    ['Import', { b: true, color: GREY, i: true }],
    ', and follow the prompts to upload this file. Any content that you import can be edited on ' +
    'Coursera later.']));
  P.push(blank());
  P.push(note([['💡 ', { color: '1f1f1f' }], ['Tip:', { b: true, color: '666666', i: true }],
    [' What you write in the Guide Section won’t be imported, but can be used for your own reference.']]));
  P.push(blank());

  // ---- Import Section (template Heading1) ----
  P.push(H('Import Section', 1));
  P.push(para([['----- Importable content starts here -----', grey]], { style: 'Heading3', run: grey }));
  P.push(blank());

  for (const q of mo.questions) {
    P.push(para([[`Question ${q.num} - multiple choice, shuffle`]], { style: 'Heading4' }));
    // Prompt paragraphs are reproduced exactly as the source has them — same split, same
    // bold/italic per paragraph — so the scenario and the question keep their visual gap.
    // Only the leading "Scenario:" label is dropped: the importer reads a line starting
    // `word:` as an answer option, which is what made every scenario question fail.
    // Text passes through verbatim — spacing inside the source is preserved exactly.
    // No character formatting is applied: all quiz content is plain text. The source's
    // bold/italic is deliberately NOT carried over. The paragraph split and its gap are
    // kept, since those are layout rather than text styling.
    // This quiz stores the prompt as one string; the OSHA one stores an array of
    // paragraphs. Accept either so the same builder works for both courses.
    // ONE paragraph, always. Five of the ten questions write the scenario and the question it
    // asks as two lines, separated by a <w:br/> in the source. Emitting them as two paragraphs
    // is what rejected this document:
    //
    //   We can only import questions that are found between the sentence
    //   "----- Importable content starts here -----" and the sentence
    //   "----- End of importable content -----."
    //
    // The markers were present and correct; the second prompt paragraph is an unmatched line
    // (SETUP §7), and it breaks the parse for the WHOLE document rather than the one question —
    // which is why Coursera reported no questions found instead of naming the five. The graded
    // and practice quizzes are unaffected: every one of their questions is already a single
    // prompt line, and all twelve of those documents read HPOFOFOFOF exactly.
    //
    // Joining loses no word — only the line break becomes a space, which is how the sentence
    // reads anyway ("… Nobody outside the team notices. How should this be read?").
    const promptParas = [(Array.isArray(q.prompt) ? q.prompt : [q.prompt])
      .map(line => String(line).trim())
      .filter(Boolean)
      .join(' ')].filter(t => t.trim());

    // A prompt line beginning "Word:" is read by the importer as an answer option — the
    // failure that rejected every scenario question on osha. The documented failure is a
    // ONE-WORD label ("Scenario:"), and that still stops the build.
    //
    // A multi-word opening before a colon is prose rather than a label. Coursera's own
    // reference prompt runs ~800 characters and contains punctuation freely, so treating any
    // colon in the first 25 characters as a label would block a legitimate question.
    // Multi-word openings warn instead of throwing, and the warning names the question so it
    // can be import-tested first.
    promptParas.forEach((text, i) => {
      const label = /^([A-Za-z][A-Za-z ]{0,24}):\s/.exec(text);
      if (label && !/\s/.test(label[1]))
        throw new Error(`prompt line starts with a one-word label, which the importer reads as an `
          + `answer option: ${text.slice(0, 40)}`);
      if (label)
        console.error(`WARN Module ${mo.num} Q${q.num}: prompt opens "${label[1]}:" — prose, not a `
          + 'label, but import-test this module before relying on it');
      const last = i === promptParas.length - 1;
      P.push(para([[text]], { gapAfter: !last }));
    });
    P.push(blank());
    const refer = referLine(q.module);
    for (const o of q.options) {
      const star = o.letter === q.correct ? '*' : '';
      P.push(para([[`${star}${o.letter}: ${o.text}`]]));
      // Required layout — explanation and bracketed reference on ONE line:
      //   Feedback: <explanation> (Refer to Module X Lesson Y Video: <title>)
      // This is also the safest possible form for the importer: one paragraph, one run,
      // no line breaks at all, matching Coursera's own convention of putting the review
      // pointer inline in the feedback sentence.
      // Explanation passes through verbatim — spacing inside it is preserved exactly.
      const fbText = 'Feedback: ' + stripVerdict(q.feedback[o.letter] || '') + ' (' + refer + ')';
      P.push(para([[fbText]]));
      P.push(blank());
    }
  }

  P.push(para([['----- End of importable content -----', grey]], { style: 'Heading3', run: grey }));
  P.push(blank());
  P.push(blank());

  // ---- Reference-only remainder (template Heading3 divider) ----
  P.push(H('****The following content is for your reference and will not be imported.****', 3));
  P.push(blank());

  P.push(H('Guide Section', 1));
  P.push(para([['You can use the remainder of this document to design this assignment. This can be ' +
    'helpful when using '], link('backwards design principles', REL.backwards), ['.']]));

  // Core Information
  P.push(H('Core Information', 2));
  P.push(note(['For reference only. Modify as you like.']));
  P.push(para([['Instructor: ', { b: true }], [COURSE.instructor]]));
  P.push(para([['Course: ', { b: true }], [COURSE.title]]));
  P.push(para([['Placement: ', { b: true }], ['Pathway gate, before Module 1 — samples all four modules']]));

  // Assignment Title
  P.push(H('Assignment Title', 2));
  P.push(para([[mo.title]]));

  // Grading Settings
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
    // A routing tool, not a gate: no score is required and nothing blocks progress.
    ['Passing Threshold', ['Pre-course diagnostic — no passing score is required, and the result never blocks progress.'], ['0%']],
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

  // Instructions for Learners
  P.push(H('Instructions for Learners', 2));
  P.push(note(['Create instructions for learners. Learn more about ',
    link('instructions', REL.instructions)]));

  P.push(H('Learning objectives', 4));
  P.push(note(['Assessments are used to measure learners\' mastery of the course learning objectives. ' +
    'Here, you can indicate which learning objectives are associated with this assessment. Learn more about ',
    link('learning objectives', REL.objectives)]));
  los.forEach((lo, i) => {
    P.push(H(`Learning Objective ${i + 1}`, 4));
    P.push(para([[`${lo}: ${COURSE.los[lo] || ''}`.trim()]]));
  });

  P.push(H('Instructions overview', 4));
  P.push(para([[`This short self-assessment gives you a picture of where you already stand before ` +
    `the course begins. It contains ${nQ} multiple-choice questions drawn from all ` +
    `${Object.keys(MMETA).length} modules, and it uses everyday workplace language rather than ` +
    `course terminology, so no prior study is needed. Select the single best answer for each ` +
    `question. Nothing here is graded and nothing blocks your progress — every module stays open ` +
    `whatever you answer. After you submit, you will see an explanation for every option along ` +
    `with the module to focus on. You can take it again after the course-end project to see how ` +
    `your answers have changed.`]]));

  P.push(H('Review Criteria Summary', 4));
  P.push(para([[`All ${nQ} questions are auto-graded and the result is shown immediately. Nothing ` +
    `here counts toward the course grade and no score is required — the platform shows whether ` +
    `each response was correct rather than a total, so the pattern across the four modules is ` +
    `what the learner reads. Feedback is released on every option, correct or not, with the ` +
    `module to focus on.`]]));

  // Instructions for Graders
  P.push(H('Instructions for Graders', 2));
  P.push(note(['Create instructions for graders. Learn more about ',
    link('instructions', REL.instructions2)]));
  P.push(H('Instructions (not shown to learners)', 4));
  P.push(note(['Provide a general summary of the grading criteria that’s only visible to graders']));
  P.push(para([[`No manual grading is required. This is an ungraded, non-blocking diagnostic; all ${nQ} ` +
    `questions are auto-graded multiple choice ` +
    `with a single correct answer worth 1 point each. The answer key and the video mapped to each ` +
    `question are listed under “Working area for question design” at the end of this document.`]]));

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
  // No Bloom's-level column: this course's assessment does not record one.
  // "Skill assessed" is the course team's own guidance and is deliberately not shown to the
  // learner, so the Guide Section is the right place for it.
  const rows = [{ head: true, cells: [['Q#'], ['Module'], ['Skill assessed'], ['Key']] }];
  for (const q of mo.questions) {
    rows.push({ cells: [[`Q${q.num}${q.scenarioBased ? ' (scenario)' : ''}`], [`Module ${q.module}`],
      [q.skill], [q.correct]] });
  }
  P.push(table(rows, [900, 900, 5480, 620]));
  P.push(blank());

  return P.join('');
}

// ---------- package writer ----------
function writeDocx(mo, outPath) {
  const stage = path.join(SP, 'stage');
  fs.rmSync(stage, { recursive: true, force: true });
  fs.cpSync(TMPL, stage, { recursive: true });

  // drop comments part (template's margin tips do not apply to generated files)
  fs.rmSync(path.join(stage, 'word', 'comments.xml'), { force: true });
  const ctPath = path.join(stage, '[Content_Types].xml');
  fs.writeFileSync(ctPath, fs.readFileSync(ctPath, 'utf8')
    .replace(/<Override[^>]*comments\.xml"\/>/g, ''));
  const relPath = path.join(stage, 'word', '_rels', 'document.xml.rels');
  fs.writeFileSync(relPath, fs.readFileSync(relPath, 'utf8')
    .replace(/<Relationship[^>]*Target="comments\.xml"[^>]*\/>/g, ''));

  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">` +
    `<w:body>${buildBody(mo)}${sectPr}</w:body></w:document>`;
  fs.writeFileSync(path.join(stage, 'word', 'document.xml'), doc, 'utf8');

  fs.rmSync(outPath, { force: true });
  zipDir(stage, outPath);
  fs.rmSync(stage, { recursive: true, force: true });
  return outPath;
}

fs.mkdirSync(OUT, { recursive: true });
const locked = [];
for (const mo of mods) {
  const name = 'Coursera_Import_Pre_Course_Diagnostic_Soft_Skills.docx';
  try {
    const p = writeDocx(mo, path.join(OUT, name));
    console.log('WROTE  ' + name + '  (' + mo.questions.length + ' questions, ' +
      fs.statSync(p).size + ' bytes)');
  } catch (err) {
    if (err.code !== 'EPERM' && err.code !== 'EBUSY') throw err;
    locked.push(name);
    console.log('LOCKED ' + name + '  (open in another application — not overwritten)');
  }
}
if (locked.length) {
  console.log('\nSTILL LOCKED: ' + locked.join(', '));
  process.exitCode = 2;
}
