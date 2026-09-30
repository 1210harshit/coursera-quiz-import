// Shared builder for courses whose assessments arrive as one .docx per quiz, parsed into
// work/<course>/quizzes.json by that course's own parser — one Assignment Import .docx per
// source document.
//
//   node src/quiz-import-build.js <course> <outDir> [--no-br]
//
//   ai-automation   Deploying, Governing, Measuring, and Scaling AI-Powered Automation (17 files)
//   oversight       Oversight, Accountability, Trust, and Responsible AI (19 files)
//
// Built from managing-practice-build.js: same template skeleton, same plain-text import
// section, same feedback layout. What differs is where the metadata comes from. There is no
// outline for these courses, so everything the managing builder reads from outline.json —
// objectives, time estimate, attempts, passing threshold — is read from the settings table
// each source document carries, and the reference line is built from the asset TITLES each
// question cites (see referLine).
//
// Output files are named from the documents themselves, by request:
//   "M1L1 - Test Design for AI Assistants - Practice Quiz.docx"
//   "M1 - Testing, Deploying, and Monitoring Assistants - Graded Quiz.docx"
//   "M5L1 - Deploying, Governing, Measuring, and Scaling AI-Powered Automation - Final Exam.docx"
const fs = require('fs');
const path = require('path');
const { zipDir } = require('./lib-zipwriter');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const TMPL = path.join(SP, 'tmpl');
const [SLUG, OUT] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!SLUG || !OUT) { console.error('usage: node src/quiz-import-build.js <course> <outDir> [--no-br]'); process.exit(1); }
const quizzes = JSON.parse(fs.readFileSync(path.join(SP, SLUG, 'quizzes.json'), 'utf8'));
// A parser that reads the course title from the documents stores it on every quiz. The
// ai-automation sources disagree with themselves (two practice quizzes drop "Measuring,"), so
// its parser stores none and the final exam's own title is used.
const COURSE_FALLBACK = { 'ai-automation': 'Deploying, Governing, Measuring, and Scaling AI-Powered Automation' };
const courses = [...new Set(quizzes.map(q => q.course).filter(Boolean))];
if (courses.length > 1) { console.error('quizzes disagree on the course title: ' + courses.join(' | ')); process.exit(1); }
const COURSE = courses[0] || COURSE_FALLBACK[SLUG];
if (!COURSE) { console.error(`no course title for ${SLUG}`); process.exit(1); }
const KIND = { practice: 'Practice Quiz', graded: 'Graded Quiz', final: 'Final Exam' };

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

// These sources open most explanations with a verdict — "Correct.", "Correct!", "Incorrect.",
// "Not quite." — and Coursera already shows the learner whether their option was right, so the
// word only repeats the interface; beside an option the learner did not pick, on a shuffled
// quiz, it reads as wrong. Removes the marker and the whitespace after it, nothing else.
function stripVerdict(fb) {
  const out = String(fb)
    .replace(/^(?:\((?:Correct|Incorrect)\)|(?:Correct|Incorrect|Not quite|Wrong)\s*[.:,!—–-])\s*/i, '');
  if (!out.trim()) throw new Error('feedback empty after stripping verdict: ' + fb);
  return out;
}

// Reference on its own line, below the explanation. See the note at the feedback line
// below; --no-br restores the single-line form.
const REF_OWN_LINE = !process.argv.includes('--no-br');

// "Refer to Module 1 Lesson 1 Video: Judging Assistant Responses"
// "Refer to Module 3 Lesson 2 Video: Designing a Reporting Cadence; Reading: Dashboard Design Guide ..."
// "Refer to Module 1 Lesson 1 Video: X; Module 1 Lesson 2 Reading: Y"   (assets in two lessons)
//
// The asset TYPE stands where the video number would, by decision (2026-09-29): the sources
// name every asset by title only, and no outline exists to number them. Titles pass through
// verbatim as the question cites them; the "(7 mins)" / "(Lesson 1)" annotations some sources
// append were consumed by the parser as metadata. Every asset the question cites is kept.
const where = a => `Module ${a.module}` + (a.lesson ? ` Lesson ${a.lesson}` : '');
function referLine(q) {
  const parts = [];
  let last = null;
  for (const a of q.assets) {
    const at = where(a);
    parts.push((at === last ? '' : at + ' ') + `${a.type}: ${a.title}`);
    last = at;
  }
  return 'Refer to ' + parts.join('; ');
}

// hh:mm from the source's "N minutes per question".
function timeEstimate(qz) {
  // "2 minutes per question", "~2 minutes per question", "~2 min/question"
  const m = /(\d+)\s*min(?:ute)?s?\s*(?:per\s*|\/\s*)question/i.exec(qz.settings.timeEstimate || '');
  if (!m) throw new Error(`${qz.file}: unreadable time estimate "${qz.settings.timeEstimate}"`);
  const mins = +m[1] * qz.questions.length;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
// Practice quizzes state a question count ("4" of 5), graded ones a percentage ("80%").
function passing(qz) {
  const p = String(qz.settings.passing || '').trim();
  if (/^\d+%$/.test(p)) return p;
  if (/^\d+$/.test(p)) return Math.round(100 * +p / qz.questions.length) + '%';
  throw new Error(`${qz.file}: unreadable passing threshold "${p}"`);
}
// "Unlimited" -> 0, the template's "no maximum". The final exam states no attempts at all;
// that is written as 0 too and flagged in the guide rather than guessed.
function attempts(qz) {
  const a = String(qz.settings.attempts || '').trim();
  if (!a) return { value: '0', stated: false };
  if (/^unlimited$/i.test(a)) return { value: '0', stated: true };
  if (/^\d+$/.test(a)) return { value: a, stated: true };
  throw new Error(`${qz.file}: unreadable attempts "${a}"`);
}

// Labels used in prose and file names.
const at = qz => qz.lesson ? `Module ${qz.module} Lesson ${qz.lesson}` : `Module ${qz.module}`;
const code = qz => `M${qz.module}` + (qz.lesson ? `L${qz.lesson}` : '');
function fileName(qz) {
  // A colon is not a safe file-name character on macOS or Windows.
  const title = qz.title.replace(/\s*:\s*/g, ' - ').replace(/[\\/*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  return `${code(qz)} - ${title} - ${KIND[qz.kind]}.docx`;
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
  const los = mo.objectives;
  const nQ = mo.questions.length;
  const kind = KIND[mo.kind];
  const isPractice = mo.kind === 'practice';
  const timeEst = timeEstimate(mo);
  const att = attempts(mo);

  // ---- Title + intro (template lines 1-2) ----
  P.push(para([[`${COURSE} — ${at(mo)} ${kind}: ${mo.title}`]], { style: 'Title' }));
  P.push(note(['This document lets you import questions into the assignment that you create in ' +
    'Coursera. Learn more about ', link('assignments', REL.assignments)]));

  // ---- Getting started (template Heading1) ----
  P.push(H('Getting started', 1));
  // NOTE: the marker lines are "Importable content starts here" / "End of importable content".
  // Like the original template, this guidance says "Imported content" instead, so the prose can
  // never be mistaken for the markers themselves by the importer.
  P.push(note([`The questions for this quiz are in the `, link('Import Section', REL.examples),
    ` below, after the “Imported content starts here” line (and before the ` +
    `“End of imported content” line). This document contains all ${nQ} questions of the ` +
    `${at(mo)} ${kind.toLowerCase()}: ${mo.title}.`]));
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
  P.push(note([`To import, create a new ${isPractice ? 'practice quiz' : 'graded quiz'} in ${at(mo)} of your Coursera course, click `,
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
    const promptParas = (Array.isArray(q.prompt) ? q.prompt : [q.prompt])
      .map((line, i) => (i === 0 ? line.replace(/^\s*Scenario\s*:\s*/i, '') : line))
      .filter(t => t.trim());

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
        console.error(`WARN ${mo.file} Q${q.num}: prompt opens "${label[1]}:" — prose, not a `
          + 'label, but import-test this module before relying on it');
      const last = i === promptParas.length - 1;
      P.push(para([[text]], { gapAfter: !last }));
    });
    P.push(blank());
    const refer = referLine(q);
    for (const o of q.options) {
      const star = o.letter === q.correct ? '*' : '';
      P.push(para([[`${star}${o.letter}: ${o.text}`]]));
      // Explanation, then the bracketed reference as its OWN paragraph directly below it,
      // with zero spacing so it sits tight under the explanation:
      //   Feedback: <explanation>
      //   Refer to Module 1 Lesson 1 Video 1: <title>
      //
      // Settled by an upload of src/managing-break-probe.js (2026-09-28), which tried ten
      // encodings in one document. Every <w:br/> variant — in one run, in its own run, typed
      // textWrapping, a <w:cr/> — came back from Coursera as several blank rows with stray
      // spaces before "(Refer". Only a separate paragraph (E5 zero-spaced, E8 default)
      // imported as one clean line break, and both kept the question. That overturns the
      // older note that a free-standing "Refer to ..." paragraph rejects the question — at
      // least when it follows its Feedback: paragraph with nothing between.
      //
      // No brackets and the mapping spelled out, by request (2026-09-28); the probe above
      // tested the bracketed form, so import one module to confirm this one.
      // --no-br restores the single-line form: "Feedback: <explanation> Refer to ...".
      // Explanation passes through verbatim — spacing inside it is preserved exactly.
      const fbBody = 'Feedback: ' + stripVerdict(q.feedback[o.letter] || '');
      const fbRef = refer;
      if (REF_OWN_LINE) {
        P.push(para([[fbBody]]));
        P.push(para([[fbRef]], { tight: true }));
      } else {
        P.push(para([[fbBody + ' ' + fbRef]]));
      }
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
  P.push(para([['Course: ', { b: true }], [COURSE]]));
  P.push(para([['Placement: ', { b: true }], [at(mo)]]));
  P.push(para([['Source document: ', { b: true }], [mo.file + '.docx']]));

  // Assignment Title
  P.push(H('Assignment Title', 2));
  P.push(para([[`${at(mo)} ${kind}: ${mo.title}`]]));

  // Grading Settings
  P.push(H('Grading Settings', 2));
  P.push(note(['Choose the grading settings and policies for this assignment. Learn more about ',
    link('grading', REL.grading)]));

  // Values from the source document's own settings table.
  const settings = [
    ['Grade to Save (Select with ‘*’)',
      ['Choose whether to use the learner’s highest or latest attempt as their grade.'],
      /latest/i.test(mo.settings.gradeToSave || '') ? ['Highest', '*Latest'] : ['*Highest', 'Latest']],
    ['Assignment Type (Select with ‘*’)',
      ["If the assignment type is Team, you'll be able to create and assign teams after the assignment is published."],
      ['*Individual', 'Team']],
    ['Time Estimate (hh:mm)', [`${mo.settings.timeEstimate} in the source, × ${nQ} questions.`], [timeEst]],
    ['Passing Threshold', [`“${mo.settings.passing}” in the source` +
      (/^\d+$/.test(String(mo.settings.passing).trim()) ? ` — ${mo.settings.passing} of ${nQ} correct.` : '.')],
      [passing(mo)]],
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
      [(mo.settingFixes || []).some(x => x.field === 'attempts')
        ? `Enter the maximum number of attempts allowed. Enter ‘0’ for no maximum. Set to ${att.value}: ${mo.settingFixes.find(x => x.field === 'attempts').reason}`
        : att.stated
        ? `Enter the maximum number of attempts allowed. Enter ‘0’ for no maximum. The source says “${mo.settings.attempts}”.`
        : 'Enter the maximum number of attempts allowed. Enter ‘0’ for no maximum. The source document does not state a number of attempts — set it in Coursera.'],
      [att.value]],
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
    P.push(para([[lo]]));
  });

  P.push(H('Instructions overview', 4));
  P.push(para([[isPractice
    ? `This practice quiz checks your understanding of ${at(mo)}: ${mo.title}. It contains ${nQ} ` +
      `multiple-choice questions. Select the single best answer for each question. Answer options ` +
      `are shuffled, so they may appear in a different order than a classmate sees. This quiz is ` +
      `practice: it does not count toward your course grade, and you may retake it as many times as ` +
      `you like. After you submit, you will see feedback on every option along with the lesson ` +
      `material to revisit.`
    : `This ${kind.toLowerCase()} assesses ${mo.kind === 'final' ? 'the whole course' : `Module ${mo.module}: ${mo.title}`}. ` +
      `It contains ${nQ} multiple-choice questions. Select the single best answer for each ` +
      `question. Answer options are shuffled, so they may appear in a different order than a ` +
      `classmate sees. You need ${passing(mo)} to pass. After you submit, you will see feedback on ` +
      `every option along with the lesson material to revisit.`]]));

  P.push(H('Review Criteria Summary', 4));
  P.push(para([[`All ${nQ} questions are auto-graded and the result is shown immediately. ` +
    (isPractice ? 'Nothing here contributes to the course grade. ' : '') +
    `Feedback is released on every option, correct or not, with a reference to the video, ` +
    `reading or lab that covers it.`]]));

  // Instructions for Graders
  P.push(H('Instructions for Graders', 2));
  P.push(note(['Create instructions for graders. Learn more about ',
    link('instructions', REL.instructions2)]));
  P.push(H('Instructions (not shown to learners)', 4));
  P.push(note(['Provide a general summary of the grading criteria that’s only visible to graders']));
  P.push(para([[`No manual grading is required. All ${nQ} ` +
    `questions are auto-graded multiple choice ` +
    `with a single correct answer worth 1 point each. The answer key and the assets mapped to each ` +
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
  const rows = [{ head: true, cells: [['Q#'], ['Source Q#'], ['Referenced in feedback'], ['Key']] }];
  for (const q of mo.questions) {
    rows.push({ cells: [[`Q${q.num}`], [String(q.sourceNum)],
      [referLine(q).replace(/^Refer to /, '')], [q.correct]] });
  }
  P.push(table(rows, [620, 1100, 5560, 620]));
  P.push(blank());

  return P.join('');
}

// ---------- package writer ----------
// The staging directory is identical for every document in a run except word/document.xml,
// so it is built ONCE and only that one part is rewritten per module. Copying and re-editing
// the whole 22-file template per document cost ~6 ms each for no benefit. Prepared lazily so
// a run that writes nothing never touches the disk, and torn down by the caller afterwards.
const stage = path.join(SP, 'stage');
let stageReady = false;
function prepareStage() {
  if (stageReady) return stage;
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
  stageReady = true;
  return stage;
}

function writeDocx(mo, outPath) {
  prepareStage();

  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">` +
    `<w:body>${buildBody(mo)}${sectPr}</w:body></w:document>`;
  fs.writeFileSync(path.join(stage, 'word', 'document.xml'), doc, 'utf8');

  fs.rmSync(outPath, { force: true });
  zipDir(stage, outPath);
  return outPath;
}

fs.mkdirSync(OUT, { recursive: true });
const locked = [];
const names = new Set();
for (const mo of quizzes) {
  const name = fileName(mo);
  if (names.has(name)) throw new Error('two quizzes would both be written as ' + name);
  names.add(name);
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
// The staging directory is shared by every document in the run; remove it once, at the end.
if (stageReady) fs.rmSync(stage, { recursive: true, force: true });

if (locked.length) {
  console.log('\nSTILL LOCKED: ' + locked.join(', '));
  process.exitCode = 2;
}
