// Verifies the twelve Threat Detection and SIEM Engineering with IBM QRadar LESSON PRACTICE QUIZ documents
// against practice.json.
//
//     node src/cyber-course-2-practice-verify.js work/cyber-course-2/dist-practice
//
// The checks live in cyber-course-2-docverify.js, shared with the graded quizzes and the
// final exam.
const fs = require('fs');
const path = require('path');
const { verifyAll, SP } = require('./cyber-course-2-docverify');
const { referenceStyle } = require('./cyber-course-2-lib');

const OUT = process.argv[2];
const quizzes = JSON.parse(fs.readFileSync(path.join(SP, 'cyber-course-2', 'practice.json'), 'utf8'));

const files = quizzes.map(quiz => ({
  quiz,
  refStyle: referenceStyle('practice', quiz.num, quiz.lesson),
  label: `Module ${quiz.num} Lesson ${quiz.lesson} practice quiz`,
  file: `Coursera_Import_Module_${quiz.num}_Lesson_${quiz.lesson}_Practice_Quiz_`
    + 'Cybersecurity_Course_2.docx',
}));

process.exit(verifyAll(OUT, files, 'practice quizzes') === 0 ? 0 : 1);
