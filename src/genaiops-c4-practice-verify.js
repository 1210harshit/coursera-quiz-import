// Verifies the nine Optimizing Cost, Latency, and Performance (Course 4) LESSON PRACTICE QUIZ documents
// against practice.json.
//
//     node src/genaiops-c4-practice-verify.js work/genaiops-c4/dist-practice
//
// The checks live in genaiops-c4-docverify.js, shared with the graded quizzes and the
// final exam.
const fs = require('fs');
const path = require('path');
const { verifyAll, SP } = require('./genaiops-c4-docverify');
const { referenceStyle } = require('./genaiops-c4-lib');

const OUT = process.argv[2];
const quizzes = JSON.parse(fs.readFileSync(path.join(SP, 'genaiops-c4', 'practice.json'), 'utf8'));

const files = quizzes.map(quiz => ({
  quiz,
  refStyle: referenceStyle('practice', quiz.num, quiz.lesson),
  label: `Module ${quiz.num} Lesson ${quiz.lesson} practice quiz`,
  file: `Coursera_Import_Module_${quiz.num}_Lesson_${quiz.lesson}_Practice_Quiz_`
    + 'GenAIOps_Course_4.docx',
}));

process.exit(verifyAll(OUT, files, 'practice quizzes') === 0 ? 0 : 1);
