// Parser for the twelve Deploying and Orchestrating AI Agents LESSON PRACTICE QUIZZES —
// three per teaching module, five questions each. Emits practice.json.
//
// Reads outline.json — run deploying-ai-agents-parse-outline.js first.
//
// Same grammar as the graded quizzes (lib-quizdoc-ibm reads both); what differs is the scope
// check. A practice quiz belongs to ONE lesson, and its five questions walk that lesson's
// assets in order — the three videos, then the reading, then the lab. So a reference that
// resolves to a different LESSON is reported here, where the graded parser can only check the
// module. That check is the reason the per-lesson files are parsed separately at all.
//
// Two source defects this parser reports rather than absorbs:
//   * the Escalation and Asking for Help quiz declares "No. of questions: 3" over five
//     questions. The document is what gets built; the table is wrong.
//   * one file states its module as "Module 4 - <title>" and another as the bare title, so
//     module and lesson are resolved from the filename and checked against the document.
const fs = require('fs');
const path = require('path');
const { readQuizDoc } = require('./lib-quizdoc-ibm');
const L = require('./deploying-ai-agents-lib');

const outline = L.loadOutline();
const warn = [];
const notes = [];
const out = [];

for (const d of L.listDocs()) {
  if (d.file.kind !== 'practice') continue;
  const issues = [];
  const doc = readQuizDoc(d.dir, d.base);
  issues.push(...doc.issues);

  if (doc.gradeSetting !== 'practice') {
    issues.push(`the settings table says "${doc.settings.gradeSetting}" but the filename says this `
      + 'is a lesson practice quiz');
  }
  const num = L.resolveModule(outline.meta, doc.moduleRef, d.file, issues, d.base);
  if (!num) { warn.push(...issues.map(x => `${d.base}: ${x}`)); continue; }
  const lesson = L.resolveLesson(outline.meta, num, doc.lessonRef, d.file, issues);
  if (!lesson) { warn.push(...issues.map(x => `M${num}: ${x}`)); continue; }

  L.resolveQuestionRefs(outline, doc, issues, d.base);

  const M = outline.meta['M' + num];
  const Lz = M.lessons[lesson];
  for (const q of doc.questions) {
    for (const r of q.refs) {
      if (r.module !== num || r.lesson !== lesson) {
        issues.push(`Q${q.num}: cites "${r.title}", which the outline places in Module ${r.module} `
          + `Lesson ${r.lesson}, but this is the Module ${num} Lesson ${lesson} practice quiz`);
      }
    }
  }

  const declared = outline.course.quizzes[`M${num}L${lesson}:Practice Quiz`] || {};

  out.push({
    num, lesson,
    source: d.base,
    title: doc.title || `${Lz.title}: Practice Quiz`,
    moduleTitle: M.title,
    lessonTitle: Lz.title,
    los: doc.los,
    moduleLOs: M.los,
    settings: doc.settings,
    minutes: declared.minutes || null,
    declaredQuestions: declared.questions || null,
    questions: doc.questions.map(q => ({
      num: q.num,
      type: q.type,
      prompt: q.prompt.join(' '),
      assetRaw: q.assetRaw,
      refs: q.refs,
      correct: q.correct,
      options: q.options.map(o => ({ letter: o.letter, text: o.text })),
      feedback: Object.fromEntries(q.options.map(o => [o.letter, o.text_feedback])),
    })),
  });

  if (declared.questions && declared.questions !== doc.questions.length) {
    issues.push(`the outline promises ${declared.questions} questions for this practice quiz and `
      + `the document has ${doc.questions.length}`);
  }
  warn.push(...issues.map(x => `M${num}L${lesson}: ${x}`));
}

out.sort((a, b) => a.num - b.num || a.lesson - b.lesson);

const expected = Object.values(outline.course.quizzes).filter(q => q.kind === 'Practice Quiz').length;
if (out.length !== expected) {
  warn.push(`${out.length} practice quiz documents found, but the outline declares ${expected}`);
}
for (const p of out) {
  const unkeyed = p.questions.filter(q => !q.correct).map(q => 'Q' + q.num);
  if (unkeyed.length) warn.push(`M${p.num}L${p.lesson}: no answer key for ${unkeyed.join(', ')}`);
  const noRef = p.questions.filter(q => !q.refs.length).map(q => 'Q' + q.num);
  if (noRef.length) warn.push(`M${p.num}L${p.lesson}: no resolved reference for ${noRef.join(', ')}`);
}
// Every teaching lesson in the outline should have exactly one practice quiz document.
for (const [mk, M] of Object.entries(outline.meta)) {
  for (const [ln, Lz] of Object.entries(M.lessons)) {
    if (!Lz.assets.some(a => a.kind === 'Practice Quiz')) continue;
    if (!out.some(p => 'M' + p.num === mk && p.lesson === Number(ln))) {
      warn.push(`${mk} Lesson ${ln} (${Lz.title}) has a practice quiz in the outline but no source document`);
    }
  }
}

if (process.argv.includes('--report')) {
  for (const p of out) {
    console.log(`Module ${p.num} Lesson ${p.lesson} — ${p.lessonTitle}`);
    console.log(`  source: ${p.source}.docx`);
    console.log(`  ${p.questions.length} questions · ${p.los.length} objectives · `
      + `${p.minutes || '?'} mins declared · key ${p.questions.map(q => q.correct || '?').join('')}`);
    for (const q of p.questions) {
      console.log(`    Q${q.num} [${q.correct || '?'}] ${q.prompt.slice(0, 60)}`);
      q.refs.forEach(r => console.log(`         -> ${r.ref}`));
    }
  }
  const nq = out.reduce((a, p) => a + p.questions.length, 0);
  console.log(`\n${out.length} practice quizzes · ${nq} questions · `
    + `${out.reduce((a, p) => a + p.questions.reduce((b, q) => b + q.refs.length, 0), 0)} references`);
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
  console.log(`notes: ${notes.length}`);
  notes.forEach(n => console.log('  ' + n));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  notes.forEach(n => console.error('NOTE ' + n));
  console.log(JSON.stringify(out, null, 2));
}
