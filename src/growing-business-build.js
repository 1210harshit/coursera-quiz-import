// Builder for HAWS Course 2 (Human + AI: Working With AI Tools, Practical Skills, Prompts &
// Systems) — one Assignment Import .docx per module, named
// Coursera_Import_Module_<n>_Graded_Quiz_Growing_Business.docx.
//
// Copied from the CSTP Course 2 builder; the one course-specific piece left is stripVerdict
// below. There is NO Bloom's column in the working-area table — these sources state no Bloom
// level, unlike the CSTP ones this was copied from. See the note above that table.
const fs = require('fs');
const path = require('path');
const { zipDir } = require('./lib-zipwriter');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const TMPL = path.join(SP, 'tmpl');
const OUT = process.argv[2];
const mods = JSON.parse(fs.readFileSync(path.join(SP, 'growing-business', 'quiz.json'), 'utf8'));
const { map: VIDEOS, meta: MMETA, course: COURSE } =
  JSON.parse(fs.readFileSync(path.join(SP, 'growing-business', 'outline.json'), 'utf8'));

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

// This source states the verdict as a paragraph LABEL — "Correct Explanation:" /
// "Incorrect Explanation:" — which the parser consumes, so the stored text is already clean.
// The strip is kept as a guard against a future revision writing the verdict inline instead,
// in either the bare form the osha source used or the bracketed form paid-social uses.
// Coursera already shows the learner whether their option was right, so either would only
// repeat the interface. Removes the marker and the whitespace after it, nothing else.
function stripVerdict(fb) {
  const out = String(fb).replace(/^(?:\((?:Correct|Incorrect)\)|(?:Correct|Incorrect)[.:,!])\s*/i, '');
  if (!out.trim()) throw new Error('feedback empty after stripping verdict: ' + fb);
  return out;
}

// "M1L3V1" -> "Refer to Module 1 Lesson 3 Video: Building Repeatable Productivity Systems"
//
// Spelled out in full words, the kind carrying no number, unbracketed, and emitted on its own
// zero-spaced paragraph below the feedback. That is the standing convention for new courses
// (SETUP section 6). CSTP Course 2, which this builder was copied from, shipped the older
// "Refer to M1L3V1: <title>" form inline and in brackets, and keeps it: a delivered course is
// not retrofitted.
//
// Each module closes with a question drawn from the module as a whole, marked "C3M<n>
// Cross-Functional" or "Cross-Lesson" and naming no video. Those get NO reference line rather
// than an invented one, so referLine returns null for them.
//
// A question may also cite TWO videos — M1's GAQ 10 reads "C3M1L1V3 / C3M1L3V3". Both go in
// ONE Refer to, joined by "; ", which is what SETUP section 6 specifies; the prefix is not
// repeated.
function referLine(codes) {
  const list = (Array.isArray(codes) ? codes : [codes]).filter(Boolean);
  if (!list.length) return null;
  const parts = list.map(code => {
    const v = VIDEOS[code];
    if (!v) throw new Error('No video in outline for mapping ' + code);
    return 'Module ' + v.module + ' Lesson ' + v.lesson + ' Video: ' + v.video;
  });
  return 'Refer to ' + parts.join('; ');
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
  const m = MMETA['M' + mo.num];
  const modTitle = m.title;
  // This course aligns SEVERAL objectives to each module.
  const los = (m.alignedLOs && m.alignedLOs.length) ? m.alignedLOs
            : (m.alignedLO ? [m.alignedLO] : []);
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
  P.push(para([[`${COURSE.title} — Module ${mo.num} Graded Quiz`]], { style: 'Title' }));
  P.push(note(['This document lets you import questions into the assignment that you create in ' +
    'Coursera. Learn more about ', link('assignments', REL.assignments)]));

  // ---- Getting started (template Heading1) ----
  P.push(H('Getting started', 1));
  // NOTE: the marker lines are "Importable content starts here" / "End of importable content".
  // Like the original template, this guidance says "Imported content" instead, so the prose can
  // never be mistaken for the markers themselves by the importer.
  P.push(note([`The questions for this quiz are in the `, link('Import Section', REL.examples),
    ` below, after the “Imported content starts here” line (and before the ` +
    `“End of imported content” line). This document contains all ${nQ} graded questions for ` +
    `Module ${mo.num}: ${modTitle}.`]));
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
  P.push(note(['To import, create a new quiz in Module ' + mo.num + ' of your Coursera course, click ',
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
    // THE "Scenario" LABEL IS KEPT, RE-PUNCTUATED ONTO THE LINE BELOW IT.
    //
    // This source writes the label on the question header and the scenario beneath it, so the
    // parser stores three paragraphs: "Scenario:", the scenario, the question. Emitting that
    // first paragraph as it stands is the one shape proven to fail — a prompt line beginning
    // `word:` is read by the importer as an answer option, which cost osha every scenario
    // question, Digital Transformation its Q2/Q8/Q9 and Soft Skills its Q1/Q7 twice over.
    //
    // Dropping the label avoids that but loses the author's word. Folding it onto the scenario
    // as "Scenario — …" keeps the word, keeps it reading as a label, and leaves the paragraph
    // structure intact: the scenario and its question stay separate paragraphs, which is what
    // SETUP section 6 asks for. Only the colon changes.
    const promptParas = (Array.isArray(q.prompt) ? q.prompt : [q.prompt])
      .map(line => String(line))
      .filter(t => t.trim())
      .reduce((acc, line) => {
        if (/^\s*Scenario\s*:\s*$/i.test(line)) { acc.pendingLabel = 'Scenario — '; return acc; }
        if (acc.pendingLabel) { acc.push(acc.pendingLabel + line.replace(/^\s+/, '')); acc.pendingLabel = null; return acc; }
        acc.push(line.replace(/^\s*Scenario\s*:\s*/i, 'Scenario — '));
        return acc;
      }, Object.assign([], { pendingLabel: null }));
    if (promptParas.pendingLabel) {
      throw new Error('a "Scenario:" label is the whole prompt — there is no line below it to fold it onto');
    }

    // --join-prompt collapses the prompt to ONE paragraph, which SETUP section 6 names as the
    // first thing to try when an import fails. THIS COURSE NEEDS IT. Built with the source's
    // two paragraphs — the scenario and its closing question — Coursera returned
    //
    //   We can only import questions that are found between the sentence "----- Importable
    //   content starts here -----" and the sentence "----- End of importable content -----."
    //
    // for the whole document, not for the questions concerned. The markers were present and
    // correct; 31 of the 40 questions carried a second prompt paragraph, and the nine that did
    // not were lost with them. The HAWS Course 3 and 4 documents built in the same week import
    // fine and have single-paragraph prompts throughout, which is what isolates it.
    //
    // Joining loses no word — only the paragraph break becomes a space.
    const JOIN = process.argv.includes('--join-prompt');
    const promptOut = JOIN && promptParas.length > 1
      ? [promptParas.map(x => String(x).trim()).filter(Boolean).join(' ')]
      : promptParas;

    promptOut.forEach((text, i) => {
      if (/^[A-Za-z][A-Za-z ]{0,24}:\s/.test(text))
        throw new Error(`prompt line starts with a label-like token: ${text.slice(0, 40)}`);
      const last = i === promptOut.length - 1;
      P.push(para([[text]], { gapAfter: !last }));
    });
    P.push(blank());
      const refer = referLine(q.mappedAll || q.mapped);
      for (const o of q.options) {
        const star = o.letter === q.correct ? '*' : '';
        P.push(para([[`${star}${o.letter}: ${o.text}`]]));
        // Required layout - the reference is a SEPARATE, ZERO-SPACED paragraph directly below
        // its feedback, never a <w:br/> inside it and never a blank paragraph between the two:
        // a blank there ends the feedback as far as the importer is concerned.
        //
        //   Feedback: <explanation>
        //   Refer to Module 1 Lesson 3 Video: <title>
        //
        // Explanation passes through verbatim - spacing inside it is preserved exactly.
        P.push(para([['Feedback: ' + stripVerdict(q.feedback[o.letter] || '')]]));
        if (refer) P.push(para([[refer]], { tight: true }));
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
  P.push(para([['Module: ', { b: true }], [`Module ${mo.num} — ${modTitle}`]]));

  // Assignment Title
  P.push(H('Assignment Title', 2));
  P.push(para([[`Module ${mo.num} Graded Quiz: ${modTitle}`]]));

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
  P.push(para([[`This graded quiz assesses your understanding of Module ${mo.num}: ${modTitle}. ` +
    `It contains ${nQ} multiple-choice questions drawn from all ${Object.keys(m.lessons).length} ` +
    `lessons in the module. Select the single best answer for each question. Answer options are ` +
    `shuffled, so they may appear in a different order than a classmate sees. You need a score of ` +
    `80% or higher to pass, and you may retake the quiz as many times as you need — your highest ` +
    `score is the one that counts. After you submit, you will see feedback on every option along ` +
    `with the specific lesson video to revisit.`]]));

  P.push(H('Review Criteria Summary', 4));
  P.push(para([[`Each question is worth 1 point, for a total of ${nQ} points. All questions are ` +
    `auto-graded, so your score is available as soon as you submit. A score of 80% or higher ` +
    `(${Math.ceil(nQ * 0.8)} of ${nQ}) is required to pass. Feedback is released immediately and ` +
    `includes an explanation for every option plus a reference to the lesson video that covers it.`]]));

  // Instructions for Graders
  P.push(H('Instructions for Graders', 2));
  P.push(note(['Create instructions for graders. Learn more about ',
    link('instructions', REL.instructions2)]));
  P.push(H('Instructions (not shown to learners)', 4));
  P.push(note(['Provide a general summary of the grading criteria that’s only visible to graders']));
  P.push(para([[`No manual grading is required. All ${nQ} questions are auto-graded multiple choice ` +
    `with a single correct answer worth 1 point each. The answer key, the Bloom’s level, and the ` +
    `video mapped to each question are listed under “Working area for question design” at the end ` +
    `of this document.`]]));

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
  // No Bloom's column: these sources state no Bloom level, unlike the CSTP ones this builder
  // came from. Module 2's questions are cross-functional and name no video, so their
  // "Mapped to" cell carries the scope the source gave them and the video cell reads "—".
  const rows = [{ head: true,
    cells: [['Q#'], ['Mapped to'], ['Video referenced in feedback'], ['Key']] }];
  for (const q of mo.questions) {
    const v = q.mapped ? VIDEOS[q.mapped] : null;
    rows.push({ cells: [[`Q${q.num}`], [q.mapped || q.scope || '—'],
      [v ? `Module ${v.module} Lesson ${v.lesson}: ${v.video}` : '—'], [q.correct]] });
  }
  P.push(table(rows, [620, 1400, 5260, 620]));
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
  const name = `Coursera_Import_Module_${mo.num}_Graded_Quiz_Growing_Business.docx`;
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
