// Verifies the twelve Performance Management and Capstone Leadership (Course 5) LESSON PRACTICE QUIZ documents
// against practice.json.
//
//     node src/agentic-teams-c5-practice-verify.js work/agentic-teams-c5/dist-practice
//
// The checks live in agentic-teams-c5-docverify.js, shared with the graded quizzes and the
// final exam.
const fs = require('fs');
const path = require('path');
const { verifyAll, SP } = require('./agentic-teams-c5-docverify');
const { referenceStyle } = require('./agentic-teams-c5-lib');

const OUT = process.argv[2];
const quizzes = JSON.parse(fs.readFileSync(path.join(SP, 'agentic-teams-c5', 'practice.json'), 'utf8'));

const files = quizzes.map(quiz => ({
  quiz,
  refStyle: referenceStyle('practice', quiz.num, quiz.lesson),
  label: `Module ${quiz.num} Lesson ${quiz.lesson} practice quiz`,
  file: `Coursera_Import_Module_${quiz.num}_Lesson_${quiz.lesson}_Practice_Quiz_`
    + 'Agentic_Teams_Course_5.docx',
}));

process.exit(verifyAll(OUT, files, 'practice quizzes') === 0 ? 0 : 1);
