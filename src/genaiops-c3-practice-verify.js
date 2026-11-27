// Verifies the twelve Designing Human-AI Collaboration (Course 2) LESSON PRACTICE QUIZ documents
// against practice.json.
//
//     node src/genaiops-c3-practice-verify.js work/genaiops-c3/dist-practice
//
// The checks live in genaiops-c3-docverify.js, shared with the graded quizzes and the
// final exam.
const fs = require('fs');
const path = require('path');
const { verifyAll, SP } = require('./genaiops-c3-docverify');
const { referenceStyle } = require('./genaiops-c3-lib');

const OUT = process.argv[2];
const quizzes = JSON.parse(fs.readFileSync(path.join(SP, 'genaiops-c3', 'practice.json'), 'utf8'));

const files = quizzes.map(quiz => ({
  quiz,
  refStyle: referenceStyle('practice', quiz.num, quiz.lesson),
  label: `Module ${quiz.num} Lesson ${quiz.lesson} practice quiz`,
  file: `Coursera_Import_Module_${quiz.num}_Lesson_${quiz.lesson}_Practice_Quiz_`
    + 'GenAIOps_Course_3.docx',
}));

process.exit(verifyAll(OUT, files, 'practice quizzes') === 0 ? 0 : 1);
