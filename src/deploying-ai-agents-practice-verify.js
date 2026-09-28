// Verifies the twelve Deploying and Orchestrating AI Agents LESSON PRACTICE QUIZ documents
// against practice.json.
//
//     node src/deploying-ai-agents-practice-verify.js work/deploying-ai-agents/dist-practice
//
// The checks live in deploying-ai-agents-docverify.js, shared with the graded quizzes and the
// final exam.
const fs = require('fs');
const path = require('path');
const { verifyAll, SP } = require('./deploying-ai-agents-docverify');
const { referenceStyle } = require('./deploying-ai-agents-lib');

const OUT = process.argv[2];
const quizzes = JSON.parse(fs.readFileSync(path.join(SP, 'deploying-ai-agents', 'practice.json'), 'utf8'));

const files = quizzes.map(quiz => ({
  quiz,
  refStyle: referenceStyle('practice', quiz.num, quiz.lesson),
  label: `Module ${quiz.num} Lesson ${quiz.lesson} practice quiz`,
  file: `Coursera_Import_Module_${quiz.num}_Lesson_${quiz.lesson}_Practice_Quiz_`
    + 'Deploying_AI_Agents.docx',
}));

process.exit(verifyAll(OUT, files, 'practice quizzes') === 0 ? 0 : 1);
