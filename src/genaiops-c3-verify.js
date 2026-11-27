// Verifies the four Designing Human-AI Collaboration (Course 2) MODULE GRADED QUIZ documents against
// quiz.json.
//
//     node src/genaiops-c3-verify.js work/genaiops-c3/dist
//
// The checks themselves live in genaiops-c3-docverify.js, shared with the practice
// quizzes and the final exam so that no family is verified more loosely than another.
const fs = require('fs');
const path = require('path');
const { verifyAll, SP } = require('./genaiops-c3-docverify');
const { referenceStyle } = require('./genaiops-c3-lib');

const OUT = process.argv[2];
const mods = JSON.parse(fs.readFileSync(path.join(SP, 'genaiops-c3', 'quiz.json'), 'utf8'));

const files = mods.map(quiz => ({
  quiz,
  refStyle: referenceStyle('graded', quiz.num),
  label: `Module ${quiz.num} graded quiz`,
  file: `Coursera_Import_Module_${quiz.num}_Graded_Quiz_GenAIOps_Course_3.docx`,
}));

process.exit(verifyAll(OUT, files, 'graded quizzes') === 0 ? 0 : 1);
