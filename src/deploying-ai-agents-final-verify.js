// Verifies the Deploying and Orchestrating AI Agents FINAL EXAM document against final.json.
//
//     node src/deploying-ai-agents-final-verify.js work/deploying-ai-agents/dist-final
//
// The checks live in deploying-ai-agents-docverify.js, shared with the graded and practice
// quizzes. One extra check is specific to the exam: it is the only document whose questions
// are supposed to reference more than one module, so its module coverage is reported here
// rather than treated as a scope error.
const fs = require('fs');
const path = require('path');
const { verifyAll, SP } = require('./deploying-ai-agents-docverify');
const { referenceStyle } = require('./deploying-ai-agents-lib');

const OUT = process.argv[2];
const exams = JSON.parse(fs.readFileSync(path.join(SP, 'deploying-ai-agents', 'final.json'), 'utf8'));

const files = exams.map(quiz => ({
  quiz,
  refStyle: referenceStyle('final', quiz.num),
  label: 'Final exam',
  file: 'Coursera_Import_Module_5_Final_Exam_Deploying_AI_Agents.docx',
}));

const fail = verifyAll(OUT, files, 'final exam');

for (const quiz of exams) {
  const by = {};
  quiz.questions.forEach(q => q.refs.forEach(r => { by[r.module] = (by[r.module] || 0) + 1; }));
  const covered = quiz.scope.filter(m => by[m]);
  console.log(`\nfinal exam coverage: ${Object.keys(by).sort()
    .map(m => `Module ${m} ${by[m]} reference${by[m] === 1 ? '' : 's'}`).join(' · ')}`);
  if (covered.length !== quiz.scope.length) {
    console.log(`   ⚠  the exam claims Modules ${quiz.scope.join(', ')} but references nothing from `
      + quiz.scope.filter(m => !by[m]).map(m => 'Module ' + m).join(', '));
  }
}

process.exit(fail === 0 ? 0 : 1);
