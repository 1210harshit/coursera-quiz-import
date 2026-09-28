// Document assembly for Deploying and Orchestrating AI Agents. The four graded quizzes, the
// twelve lesson practice quizzes and the final exam are the SAME Coursera Assignment Import
// document with different headers, settings and guide text, so they are built from one place.
//
// This is deliberately a shared module rather than three near-identical builders. Three copies
// of four hundred lines is how a fix lands in two of them; the three entry points below hold
// only what genuinely differs.
//
// THE REFERENCE LINE. Every option's feedback ends with the pointer back to the source
// material, spelled out in full words at the course owner's request:
//
//     Feedback: <explanation> (Refer to Module 1 Lesson 1 Video: Choosing a Coordination Pattern)
//     Feedback: <explanation> Refer to Module 1 Lesson 1 Video: Choosing a Coordination Pattern
//
// BOTH FORMS ARE IN USE in this course, deliberately. The course owner asked to see the
// unbracketed form on one document — the Module 1 Lesson 3 practice quiz — before it goes
// across the set. Which document gets which is decided in one place,
// deploying-ai-agents-lib.js, because the verifier has to agree; see the note there.
//
// Unlike every previous course, the pointer is NOT always a video. This source cites the asset
// each question was written from, and 28 of its 110 questions were written from a Reading, a
// Lab, an FAQ or a Discussion Prompt. The reference names whatever the source named, in the
// same spelled-out shape — "Module 1 Lesson 1 Reading: …", "Module 1 Lesson 1 Lab: …" — because
// sending a learner to a video that does not cover the question is worse than the format
// being uniform. Where a question cites two assets, both are listed, separated by "; ".
const fs = require('fs');
const path = require('path');
const { zipDir } = require('./lib-zipwriter');
const { referenceStyle, referSuffix } = require('./deploying-ai-agents-lib');

const SP = process.env.QUIZ_WORK || path.join(__dirname, '..', 'work');
const TMPL = path.join(SP, 'tmpl');

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
function link(text, rel) {
  return { raw: `<w:hyperlink r:id="${rel}">${run(text, { color: LINK, u: true })}</w:hyperlink>` };
}
function para(runs, o = {}) {
  const style = o.style ? `<w:pStyle w:val="${o.style}"/>` : '';
  // o.gapAfter: visual space below the paragraph, achieved with paragraph spacing rather than
  // an empty paragraph — an empty line inside a prompt could terminate it for the importer.
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
const grey = { color: GREY, i: true };
const H = (t, n) => para([[t]], { style: 'Heading' + n });
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

// ---------- settings translation ----------
// The source states its settings in its own words; the template wants the importer's. Nothing
// here invents a value: where the source is silent or self-contradictory, the caller is told.

// "Unlimited" -> 0 (the template's "no maximum"), "2" -> 2.
function attemptsValue(raw, warnings, where) {
  const t = String(raw || '').trim();
  if (!t) { warnings.push(`${where}: no "Attempts" row — no maximum is written`); return '0'; }
  if (/unlimited|no\s*max/i.test(t)) return '0';
  const n = /^\d+$/.exec(t);
  if (n) return t;
  warnings.push(`${where}: "Attempts: ${t}" is not a number or "Unlimited" — no maximum is written`);
  return '0';
}

// "80%" -> "80%". "4" or "4/5" -> a percentage of the questions the document ACTUALLY has,
// which is not always the count the source's own table claims.
function thresholdValue(raw, nQ, warnings, where) {
  const t = String(raw || '').trim();
  if (!t) { warnings.push(`${where}: no "Passing threshold" row`); return null; }
  if (/^\d+\s*%$/.test(t)) return t.replace(/\s+/g, '');
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  const count = frac ? Number(frac[1]) : (/^\d+$/.test(t) ? Number(t) : null);
  if (count === null) { warnings.push(`${where}: cannot read "Passing threshold: ${t}"`); return null; }
  if (frac && Number(frac[2]) !== nQ) {
    warnings.push(`${where}: the source writes the passing threshold as ${t}, but the document has `
      + `${nQ} questions. ${count} of ${nQ} is written.`);
  } else if (!frac && count > nQ) {
    warnings.push(`${where}: the passing threshold is ${count} but there are only ${nQ} questions`);
    return null;
  }
  return Math.round((count / nQ) * 100) + '%';
}

// "~3 minutes per question" + 10 questions -> 30 -> "00:30".
//
// THE DOCUMENT'S OWN TABLE WINS over the syllabus' summary line. Every one of the seventeen
// source files states its timing, and sixteen agree with the syllabus to the minute. The
// seventeenth — the final exam — states it twice, as "~3 minutes per question" and as "about
// 30 minutes total", while the syllabus summarises it as 20. Two statements in the document
// being built beat one in the document summarising it, and the disagreement is reported so the
// syllabus can be corrected. The outline's figure is the fallback for a file that states none.
function timeEstimate(declaredMinutes, raw, nQ, warnings, where) {
  const s = String(raw || '');
  const total = /(?:about\s*)?(\d+)\s*(?:mins?|minutes?)\s*total/i.exec(s);
  const per = /(\d+)\s*(?:mins?|minutes?)\s*(?:per|\/)\s*question/i.exec(s);
  const fromDoc = total ? Number(total[1]) : (per ? Number(per[1]) * nQ : null);

  let mins = fromDoc || declaredMinutes || null;
  if (!mins) { warnings.push(`${where}: no readable time estimate — 00:00 is written`); mins = 0; }
  else if (fromDoc && declaredMinutes && fromDoc !== declaredMinutes) {
    warnings.push(`${where}: the document's table works out to ${fromDoc} mins and the syllabus `
      + `budgets ${declaredMinutes}; the document's figure (${fromDoc}) is written — correct the `
      + 'syllabus so the two agree');
  }
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

const starred = (vals, want) => vals.map(v =>
  (String(v).toLowerCase() === String(want || '').toLowerCase() ? '*' : '') + v);

// ---------- the document ----------
// spec: {
//   kind: 'graded' | 'practice' | 'final',
//   heading, assignmentTitle, importWhere, instructionsOverview, reviewCriteria,
//   graderNote, coreRows: [[label, value]], quiz (the parsed record), course
// }
function buildBody(spec, warnings) {
  const { quiz, course } = spec;
  const P = [];
  const nQ = quiz.questions.length;
  const where = spec.shortName;

  const timeEst = timeEstimate(quiz.minutes, quiz.settings.timeEstimate, nQ, warnings, where);
  const attempts = attemptsValue(quiz.settings.attempts, warnings, where);
  const threshold = thresholdValue(quiz.settings.passingThreshold, nQ, warnings, where);

  // ---- Title + intro ----
  P.push(para([[spec.heading]], { style: 'Title' }));
  P.push(note(['This document lets you import questions into the assignment that you create in '
    + 'Coursera. Learn more about ', link('assignments', REL.assignments)]));

  // ---- Getting started ----
  // The marker lines are "Importable content starts here" / "End of importable content". Like
  // the original template, this guidance says "Imported content" instead, so the prose can
  // never be mistaken for the markers themselves by the importer.
  P.push(H('Getting started', 1));
  P.push(note(['The questions for this quiz are in the ', link('Import Section', REL.examples),
    ' below, after the “Imported content starts here” line (and before the “End of imported '
    + `content” line). This document contains all ${nQ} ${spec.questionNoun} for ${spec.scopeText}.`]));
  P.push(blank());
  P.push(note([['This template is completely flexible and customizable', { color: '666666', i: true }],
    ['. Here are some examples of how you can customize this template:']]));
  P.push(note(['• You can move sections around (just don’t delete the “Imported content starts '
    + 'here” and “end of imported content” lines).']));
  P.push(note(['• You can add or delete sections or subsections.']));
  P.push(note(['• You can add any other content you like such as “document status” to help with '
    + 'project management aspects.']));
  P.push(note(['• You can change the assessment name or document name.']));
  P.push(blank());
  P.push(note(['To be imported properly, the questions must match the formatting guidelines '
    + 'provided here and in the ', link('example questions', REL.examples),
    ' reference. The Guide Section in this document outlines the other attributes that you can '
    + 'include in the template.']));
  P.push(blank());
  P.push(note([spec.importWhere, ['Import', { b: true, color: '666666', i: true }],
    ', and follow the prompts to upload this file. Any content that you import can be edited on '
    + 'Coursera later.']));
  P.push(blank());
  P.push(note([['💡 ', { color: '1f1f1f' }], ['Tip:', { b: true, color: '666666', i: true }],
    [' What you write in the Guide Section won’t be imported, but can be used for your own reference.']]));
  P.push(blank());

  // ---- Import Section ----
  P.push(H('Import Section', 1));
  P.push(para([['----- Importable content starts here -----', grey]], { style: 'Heading3', run: grey }));
  P.push(blank());

  for (const q of quiz.questions) {
    P.push(para([[`Question ${q.num} - multiple choice, shuffle`]], { style: 'Heading4' }));

    // The prompt is joined to ONE line. A second prompt paragraph is an unmatched line for the
    // importer and can break the parse for the WHOLE document — what made Coursera report no
    // importable questions at all on an earlier course. Joining loses no word; only the break
    // becomes a space. Text is otherwise verbatim, and no character formatting is carried over:
    // all quiz content is plain text.
    const text = String(q.prompt).trim();
    if (!text) throw new Error(`${where} Q${q.num}: empty prompt`);
    // A prompt line beginning "Word:" is read by the importer as an ANSWER OPTION — the failure
    // that rejected every scenario question on an earlier course. One word before the colon is
    // a label; several are prose, and Coursera's own reference prompt uses colons freely.
    const label = /^([A-Za-z][A-Za-z ]{0,24}):\s/.exec(text);
    if (label && !/\s/.test(label[1])) {
      warnings.push(`${where} Q${q.num}: the prompt opens with the one-word label "${label[1]}:", `
        + 'which the importer reads as an answer option. Kept verbatim — import-test this file.');
    }
    P.push(para([[text]]));
    P.push(blank());

    if (!q.correct) throw new Error(`${where} Q${q.num}: no answer key`);
    // Both assets are listed when a question cites two; the pointer stays on ONE line with the
    // explanation, which is the safest form for the importer and matches Coursera's own
    // convention of putting the review pointer inline in the feedback sentence.
    // Explanation, ONE space, then the refer statement. Whether it is bracketed is decided
    // per document in deploying-ai-agents-lib.js, which the verifier reads too — see the
    // note there. The explanation is trimmed before this is appended, so the single space
    // is the only separator either way.
    const refer = referSuffix(q.refs, spec.refStyle);
    if (!q.refs.length) {
      warnings.push(`${where} Q${q.num}: no resolved reference — its feedback carries no pointer `
        + 'back to the course material');
    }
    for (const o of q.options) {
      P.push(para([[`${o.letter === q.correct ? '*' : ''}${o.letter}: ${o.text}`]]));
      const fb = String(quiz.questions.find(x => x.num === q.num).feedback[o.letter] || '').trim();
      if (!fb) throw new Error(`${where} Q${q.num} option ${o.letter}: no feedback`);
      P.push(para([['Feedback: ' + fb + refer]]));
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
  P.push(para([['You can use the remainder of this document to design this assignment. This can be '
    + 'helpful when using '], link('backwards design principles', REL.backwards), ['.']]));

  P.push(H('Core Information', 2));
  P.push(note(['For reference only. Modify as you like.']));
  P.push(para([['Instructor: ', { b: true }], [course.instructor]]));
  P.push(para([['Course: ', { b: true }], [course.title]]));
  for (const [k, v] of spec.coreRows) P.push(para([[k + ': ', { b: true }], [v]]));
  P.push(para([['Source document: ', { b: true }], [quiz.source + '.docx']]));

  P.push(H('Assignment Title', 2));
  P.push(para([[spec.assignmentTitle]]));

  P.push(H('Grading Settings', 2));
  P.push(note(['Choose the grading settings and policies for this assignment. Learn more about ',
    link('grading', REL.grading)]));

  const settings = [
    ['Grade to Save (Select with ‘*’)',
      ['Choose whether to use the learner’s highest or latest attempt as their grade.'],
      starred(['Highest', 'Latest'], quiz.settings.gradeToSave || 'Highest')],
    ['Assignment Type (Select with ‘*’)',
      ["If the assignment type is Team, you'll be able to create and assign teams after the assignment is published."],
      ['*Individual', 'Team']],
    ['Time Estimate (hh:mm)', [], [timeEst]],
    ['Passing Threshold', spec.thresholdNote, [threshold || spec.thresholdFallback]],
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
      ['Enter the maximum number of attempts allowed. Enter ‘0’ for no maximum.'], [attempts]],
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
  P.push(note(['Assessments are used to measure learners\' mastery of the course learning objectives. '
    + 'Here, you can indicate which learning objectives are associated with this assessment. Learn more about ',
    link('learning objectives', REL.objectives)]));
  // The objectives are the ones the SOURCE document lists as addressed by this quiz — not the
  // module's whole set. That is exactly the question this template section asks.
  const los = (quiz.los && quiz.los.length) ? quiz.los : (quiz.moduleLOs || []);
  if (!los.length) warnings.push(`${where}: no learning objectives to list in the Guide Section`);
  los.forEach((lo, i) => {
    P.push(H(`Learning Objective ${i + 1}`, 4));
    P.push(para([[lo]]));
  });

  P.push(H('Instructions overview', 4));
  P.push(para([[spec.instructionsOverview]]));
  P.push(H('Review Criteria Summary', 4));
  P.push(para([[spec.reviewCriteria]]));

  P.push(H('Instructions for Graders', 2));
  P.push(note(['Create instructions for graders. Learn more about ',
    link('instructions', REL.instructions2)]));
  P.push(H('Instructions (not shown to learners)', 4));
  P.push(note(['Provide a general summary of the grading criteria that’s only visible to graders']));
  P.push(para([[spec.graderNote]]));

  P.push(H('Assignment Rubrics', 4));
  P.push(note(['You may want to include a rubric, or scoring, element that isn’t directly tied to a '
    + 'specific prompt, but rather applies to the whole assignment. Learn more about ',
    link('rubrics', REL.rubrics)]));
  P.push(para([['Not applicable. Rubrics apply to manual-graded questions only, and every question '
    + 'in this quiz is auto-graded.']]));

  P.push(H('Working area for question design', 2));
  P.push(note(['You can use this as a working area to design your questions here but they won’t be '
    + 'imported. Only questions in the Import Section of this doc will be imported.']));
  P.push(blank());
  P.push(note(['Traceability for each imported question. “Cited in source” is the Asset line the '
    + 'source document carries above the question; “Referenced in feedback” is what that resolves '
    + 'to in the syllabus. The Key column reflects the option order in this document; because '
    + 'shuffle is enabled, learners may see the options in a different order.']));
  const rows = [{ head: true, cells: [['Q#'], ['Cited in source'], ['Referenced in feedback'], ['Key']] }];
  for (const q of quiz.questions) {
    rows.push({ cells: [[`Q${q.num}`], [q.assetRaw || '—'],
      [q.refs.map(r => r.ref).join('; ') || '—'], [q.correct]] });
  }
  P.push(table(rows, [520, 2600, 4180, 500]));
  P.push(blank());

  return P.join('');
}

// ---------- package writer ----------
const tmplDoc = fs.readFileSync(path.join(TMPL, 'word', 'document.xml'), 'utf8');
const sectPr = (tmplDoc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/) || ['<w:sectPr/>'])[0];

function writeDocx(spec, outPath, warnings) {
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
    `<w:body>${buildBody(spec, warnings)}${sectPr}</w:body></w:document>`;
  fs.writeFileSync(path.join(stage, 'word', 'document.xml'), doc, 'utf8');

  fs.rmSync(outPath, { force: true });
  zipDir(stage, outPath);
  fs.rmSync(stage, { recursive: true, force: true });
  return outPath;
}

// Writes every document in `specs` into OUT, reporting locked files rather than failing on them.
// NOT named run(): that is the OOXML text-run helper above, and a second declaration of the
// same name in this scope silently replaces it.
function buildAll(OUT, specs) {
  if (!OUT) {
    console.error('usage: node <builder>.js <output directory>');
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const warnings = [];
  const locked = [];
  for (const spec of specs) {
    try {
      const p = writeDocx(spec, path.join(OUT, spec.fileName), warnings);
      console.log(`WROTE  ${spec.fileName}  (${spec.quiz.questions.length} questions, `
        + `${fs.statSync(p).size} bytes)`);
    } catch (err) {
      if (err.code !== 'EPERM' && err.code !== 'EBUSY') throw err;
      locked.push(spec.fileName);
      console.log(`LOCKED ${spec.fileName}  (open in another application — not overwritten)`);
    }
  }
  if (warnings.length) {
    console.log(`\n⚠  ${warnings.length} thing(s) to check:`);
    warnings.forEach(w => console.log('     ' + w));
  }
  if (locked.length) {
    console.log('\nSTILL LOCKED: ' + locked.join(', '));
    process.exitCode = 2;
  }
}

module.exports = { buildAll, SP };
