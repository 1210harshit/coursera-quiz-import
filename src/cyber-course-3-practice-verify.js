// Verifies the twelve Threat Response, Hunting, and Security Operations LESSON PRACTICE QUIZ documents
// against practice.json.
//
//     node src/cyber-course-3-practice-verify.js work/cyber-course-3/dist-practice
//
// The checks live in cyber-course-3-docverify.js, shared with the graded quizzes and the
// final exam.
const fs = require('fs');
const path = require('path');
const { verifyAll, SP } = require('./cyber-course-3-docverify');
const { referenceStyle } = require('./cyber-course-3-lib');

const OUT = process.argv[2];
const quizzes = JSON.parse(fs.readFileSync(path.join(SP, 'cyber-course-3', 'practice.json'), 'utf8'));

const files = quizzes.map(quiz => ({
  quiz,
  refStyle: referenceStyle('practice', quiz.num, quiz.lesson),
  label: `Module ${quiz.num} Lesson ${quiz.lesson} practice quiz`,
  file: `Coursera_Import_Module_${quiz.num}_Lesson_${quiz.lesson}_Practice_Quiz_`
    + 'Cybersecurity_Course_3.docx',
}));

process.exit(verifyAll(OUT, files, 'practice quizzes') === 0 ? 0 : 1);
