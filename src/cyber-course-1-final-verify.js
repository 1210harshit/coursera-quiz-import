// Verifies the Security Engineering Foundations and Zero Trust Architecture FINAL EXAM document against final.json.
//
//     node src/cyber-course-1-final-verify.js work/cyber-course-1/dist-final
//
// The checks live in cyber-course-1-docverify.js, shared with the graded and practice
// quizzes. One extra check is specific to the exam: it is the only document whose questions
// are supposed to reference more than one module, so its module coverage is reported here
// rather than treated as a scope error.
const fs = require('fs');
const path = require('path');
const { verifyAll, SP } = require('./cyber-course-1-docverify');
const { referenceStyle } = require('./cyber-course-1-lib');

const OUT = process.argv[2];
const exams = JSON.parse(fs.readFileSync(path.join(SP, 'cyber-course-1', 'final.json'), 'utf8'));

const files = exams.map(quiz => ({
  quiz,
  refStyle: referenceStyle('final', quiz.num),
  label: 'Final exam',
  file: `Coursera_Import_Module_${quiz.num}_Final_Exam_Cybersecurity_Course_1.docx`,
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
