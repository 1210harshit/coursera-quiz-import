// Parser for the four Designing Human-AI Collaboration (Course 2) MODULE GRADED QUIZZES.
// Emits quiz.json: one entry per module, each with its ten questions, their options, the key,
// and the resolved references the builder writes into every feedback line.
//
// Reads outline.json — run agentic-teams-c2-parse-outline.js first.
//
// What this parser decides, and why:
//
//   * THE KEY COMES FROM THE FEEDBACK VERDICT, not the star. None of the four graded documents
//     stars its key consistently: two star none of their forty options, one stars eight of ten.
//     Every option's feedback opens "Correct." or "Wrong." without exception, so that is the
//     signal. Where a star exists and disagrees, lib-quizdoc-ibm reports a conflict and leaves
//     the question unkeyed rather than picking one.
//   * THE GRADED QUIZZES DRAW FROM THE WHOLE MODULE, so each question's reference can point at
//     any lesson in it. A reference that resolves OUTSIDE the quiz's own module is reported —
//     that is the one mapping error this source shape can make invisibly.
const fs = require('fs');
const path = require('path');
const { readQuizDoc } = require('./lib-quizdoc-ibm');
const L = require('./agentic-teams-c2-lib');

const outline = L.loadOutline();
const warn = [];
const notes = [];
const mods = [];

for (const d of L.listDocs()) {
  if (d.file.kind !== 'graded') continue;
  const issues = [];
  const doc = readQuizDoc(d.dir, d.base);
  issues.push(...doc.issues);

  if (doc.gradeSetting !== 'graded') {
    issues.push(`the settings table says "${doc.settings.gradeSetting}" but the filename says this `
      + 'is the module graded quiz');
  }
  const num = L.resolveModule(outline.meta, doc.moduleRef, d.file, issues, d.base);
  if (!num) { warn.push(...issues.map(x => `${d.base}: ${x}`)); continue; }

  // The graded quizzes are module-level. Two of them carry a stray "Lesson:" line copied from a
  // practice quiz; it is reported and ignored rather than used.
  if (doc.lessonRef) {
    notes.push(`${d.base}: carries a "Lesson:" line ("${doc.lessonRef.title || doc.lessonRef.num}") `
      + 'although a module graded quiz is not scoped to one lesson — ignored');
  }

  L.resolveQuestionRefs(outline, doc, issues, d.base, { module: num });

  const M = outline.meta['M' + num];
  for (const q of doc.questions) {
    for (const r of q.refs) {
      if (r.module !== num) {
        issues.push(`Q${q.num}: cites "${r.title}", which the outline places in Module ${r.module}, `
          + `but this is the Module ${num} quiz`);
      }
    }
  }

  const declaredMins = (outline.course.quizzes[`M${num}L${Object.keys(M.lessons).slice(-1)[0]}:Graded Quiz`]
    || Object.values(outline.course.quizzes).find(x => x.module === num && x.kind === 'Graded Quiz')
    || {}).minutes || null;

  mods.push({
    num,
    source: d.base,
    title: doc.title || `${M.title}: Graded Quiz`,
    moduleTitle: M.title,
    los: doc.los,
    moduleLOs: M.los,
    settings: doc.settings,
    minutes: declaredMins,
    questions: doc.questions.map(q => ({
      num: q.num,
      type: q.type,
      prompt: q.prompt.join(' '),
      // The paragraph structure the source actually has. The builder writes these as separate
      // paragraphs; `prompt` is kept as the joined form for checks that want one string.
      promptParas: q.prompt.slice(),
      assetRaw: q.assetRaw,
      refs: q.refs,
      correct: q.correct,
      options: q.options.map(o => ({ letter: o.letter, text: o.text })),
      feedback: Object.fromEntries(q.options.map(o => [o.letter, o.text_feedback])),
    })),
  });
  warn.push(...issues.map(x => `M${num}: ${x}`));
}

mods.sort((a, b) => a.num - b.num);

const expected = Object.values(outline.course.quizzes).filter(q => q.kind === 'Graded Quiz').length;
if (mods.length !== expected) {
  warn.push(`${mods.length} graded quiz documents found, but the outline declares ${expected}`);
}
for (const m of mods) {
  const unkeyed = m.questions.filter(q => !q.correct).map(q => 'Q' + q.num);
  if (unkeyed.length) warn.push(`M${m.num}: no answer key for ${unkeyed.join(', ')}`);
  const noRef = m.questions.filter(q => !q.refs.length).map(q => 'Q' + q.num);
  if (noRef.length) warn.push(`M${m.num}: no resolved reference for ${noRef.join(', ')}`);
}

if (process.argv.includes('--report')) {
  for (const m of mods) {
    console.log(`Module ${m.num} — ${m.moduleTitle}`);
    console.log(`  source: ${m.source}.docx`);
    console.log(`  ${m.questions.length} questions · ${m.los.length} objectives · `
      + `${m.minutes || '?'} mins declared · key ${m.questions.map(q => q.correct || '?').join('')}`);
    for (const q of m.questions) {
      console.log(`    Q${q.num} [${q.correct || '?'}] ${q.prompt.slice(0, 64)}`);
      q.refs.forEach(r => console.log(`         -> ${r.ref}`));
    }
  }
  const nq = mods.reduce((a, m) => a + m.questions.length, 0);
  console.log(`\n${mods.length} modules · ${nq} questions · `
    + `${mods.reduce((a, m) => a + m.questions.reduce((b, q) => b + q.refs.length, 0), 0)} references`);
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
  console.log(`notes: ${notes.length}`);
  notes.forEach(n => console.log('  ' + n));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  notes.forEach(n => console.error('NOTE ' + n));
  console.log(JSON.stringify(mods, null, 2));
}
