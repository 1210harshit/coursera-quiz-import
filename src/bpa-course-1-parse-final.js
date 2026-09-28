// Parser for the Business Process Automation (Course 1) FINAL EXAM — one document, ten
// questions, sitting in Module 5 Lesson 1 but drawing on Modules 1 to 4. Emits final.json.
//
// Reads outline.json — run bpa-course-1-parse-outline.js first.
//
// It is parsed apart from the graded quizzes for one reason: its scope check is the opposite
// of theirs. A graded quiz that cites another module's asset has a mapping error; the final
// exam is SUPPOSED to cite all four, so what is checked here is COVERAGE — that every module
// in the exam's stated scope is actually represented, and that nothing is cited from outside
// it. Its asset citations also carry their own module prefix ("Module 1 Video: …"), which
// lib-quizdoc-ibm reads and this parser checks against where the outline puts the asset.
const fs = require('fs');
const path = require('path');
const { readQuizDoc } = require('./lib-quizdoc-ibm');
const L = require('./bpa-course-1-lib');

const outline = L.loadOutline();
const warn = [];
const notes = [];

const docs = L.listDocs().filter(d => d.file.kind === 'final');
if (!docs.length) throw new Error('no final exam document found in work/bpa-course-1/docs');
if (docs.length > 1) warn.push(`${docs.length} final exam documents found; all are parsed`);

const out = [];
for (const d of docs) {
  const issues = [];
  const doc = readQuizDoc(d.dir, d.base);
  issues.push(...doc.issues);

  if (doc.gradeSetting !== 'graded') {
    issues.push(`the settings table says "${doc.settings.gradeSetting}" but a final exam is graded`);
  }

  // The exam states its own home ("Module 5, Lesson 1" in the filename) and its scope
  // ("Scope: Modules 1–4") separately. Both are read; neither is inferred from the other.
  const num = d.file.module || 5;
  const lesson = d.file.lesson || 1;
  const M = outline.meta['M' + num];
  if (!M) issues.push(`Module ${num} is not in the outline`);
  else if (!M.lessons[lesson]) issues.push(`Module ${num} has no Lesson ${lesson} in the outline`);

  // "Modules 1–4 (course-wide)" -> [1,2,3,4]
  const scope = [];
  {
    const s = String(doc.scope || '');
    const range = /Modules?\s+(\d+)\s*[-–—to]+\s*(\d+)/i.exec(s);
    const list = s.match(/\d+/g);
    if (range) for (let i = Number(range[1]); i <= Number(range[2]); i++) scope.push(i);
    else if (list) list.forEach(n => scope.push(Number(n)));
    if (!scope.length) {
      // This course's exam states no Scope line. Rather than skip the coverage check — the one
      // check that is specific to a final exam — the scope is taken to be every module that has
      // a graded quiz of its own, which is what "the taught modules" means here. Reported, not
      // silent, because it is an inference and not something the document says.
      const taught = Object.values(outline.meta)
        .filter(M => Object.values(M.lessons).some(L =>
          L.assets.some(a => a.kind === 'Graded Quiz')))
        .map(M => M.num).sort((a, b) => a - b);
      scope.push(...taught);
      issues.push('no "Scope:" line — coverage is checked against the modules that have a graded '
        + `quiz of their own (Modules ${taught.join(', ')}). Confirm that is the exam's intended scope.`);
    }
  }

  L.resolveQuestionRefs(outline, doc, issues, d.base, { module: num });

  const seen = new Set();
  for (const q of doc.questions) {
    for (const r of q.refs) {
      seen.add(r.module);
      // The exam's own module is not "outside its scope" — it sits in Module 5 alongside the
      // cumulative project, and one question points back at that project's overview.
      if (scope.length && !scope.includes(r.module) && r.module !== num) {
        issues.push(`Q${q.num}: cites "${r.title}" from Module ${r.module}, outside the stated `
          + `scope of Modules ${scope.join(', ')}`);
      }
    }
  }
  for (const m of scope) {
    if (!seen.has(m)) {
      issues.push(`no question cites anything from Module ${m}, although the exam's scope claims `
        + 'it — the exam does not cover what it says it covers');
    }
  }

  const declared = Object.values(outline.course.quizzes).find(x => x.kind === 'Final Exam') || {};
  if (declared.questions && declared.questions !== doc.questions.length) {
    issues.push(`the outline promises ${declared.questions} questions for the final exam and the `
      + `document has ${doc.questions.length}`);
  }

  out.push({
    num, lesson, scope,
    source: d.base,
    title: doc.title || `${outline.course.title}: Final Exam`,
    moduleTitle: M ? M.title : '',
    lessonTitle: M && M.lessons[lesson] ? M.lessons[lesson].title : '',
    los: doc.los,
    moduleLOs: M ? M.los : [],
    settings: doc.settings,
    minutes: declared.minutes || null,
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
  warn.push(...issues.map(x => `final exam: ${x}`));
}

for (const f of out) {
  const unkeyed = f.questions.filter(q => !q.correct).map(q => 'Q' + q.num);
  if (unkeyed.length) warn.push(`final exam: no answer key for ${unkeyed.join(', ')}`);
  const noRef = f.questions.filter(q => !q.refs.length).map(q => 'Q' + q.num);
  if (noRef.length) warn.push(`final exam: no resolved reference for ${noRef.join(', ')}`);
}

if (process.argv.includes('--report')) {
  for (const f of out) {
    console.log(`Final Exam — Module ${f.num} Lesson ${f.lesson} (${f.lessonTitle})`);
    console.log(`  source: ${f.source}.docx`);
    console.log(`  scope: Modules ${f.scope.join(', ') || '?'}`);
    console.log(`  ${f.questions.length} questions · ${f.los.length} objectives · `
      + `${f.minutes || '?'} mins declared · key ${f.questions.map(q => q.correct || '?').join('')}`);
    for (const q of f.questions) {
      console.log(`    Q${q.num} [${q.correct || '?'}] ${q.prompt.slice(0, 58)}`);
      q.refs.forEach(r => console.log(`         -> ${r.ref}`));
    }
    const by = {};
    f.questions.forEach(q => q.refs.forEach(r => { by[r.module] = (by[r.module] || 0) + 1; }));
    console.log(`  coverage: ${Object.keys(by).sort().map(m => `M${m} ${by[m]}`).join(' · ')}`);
  }
  console.log(`\nwarnings: ${warn.length}`);
  warn.forEach(w => console.log('  ' + w));
  console.log(`notes: ${notes.length}`);
  notes.forEach(n => console.log('  ' + n));
} else {
  warn.forEach(w => console.error('WARN ' + w));
  notes.forEach(n => console.error('NOTE ' + n));
  console.log(JSON.stringify(out, null, 2));
}
