// Verifies the twelve Business Process Automation (Course 1) LESSON PRACTICE QUIZ documents
// against practice.json.
//
//     node src/bpa-course-1-practice-verify.js work/bpa-course-1/dist-practice
//
// The checks live in bpa-course-1-docverify.js, shared with the graded quizzes and the
// final exam.
const fs = require('fs');
const path = require('path');
const { verifyAll, SP } = require('./bpa-course-1-docverify');
const { referenceStyle } = require('./bpa-course-1-lib');

const OUT = process.argv[2];
const quizzes = JSON.parse(fs.readFileSync(path.join(SP, 'bpa-course-1', 'practice.json'), 'utf8'));

const files = quizzes.map(quiz => ({
  quiz,
  refStyle: referenceStyle('practice', quiz.num, quiz.lesson),
  label: `Module ${quiz.num} Lesson ${quiz.lesson} practice quiz`,
  file: `Coursera_Import_Module_${quiz.num}_Lesson_${quiz.lesson}_Practice_Quiz_`
    + 'Business_Process_Automation.docx',
}));

process.exit(verifyAll(OUT, files, 'practice quizzes') === 0 ? 0 : 1);
