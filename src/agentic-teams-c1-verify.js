// Verifies the four Foundations of Agentic Teams (Course 1) MODULE GRADED QUIZ documents against
// quiz.json.
//
//     node src/agentic-teams-c1-verify.js work/agentic-teams-c1/dist
//
// The checks themselves live in agentic-teams-c1-docverify.js, shared with the practice
// quizzes and the final exam so that no family is verified more loosely than another.
const fs = require('fs');
const path = require('path');
const { verifyAll, SP } = require('./agentic-teams-c1-docverify');
const { referenceStyle } = require('./agentic-teams-c1-lib');

const OUT = process.argv[2];
const mods = JSON.parse(fs.readFileSync(path.join(SP, 'agentic-teams-c1', 'quiz.json'), 'utf8'));

const files = mods.map(quiz => ({
  quiz,
  refStyle: referenceStyle('graded', quiz.num),
  label: `Module ${quiz.num} graded quiz`,
  file: `Coursera_Import_Module_${quiz.num}_Graded_Quiz_Agentic_Teams_Course_1.docx`,
}));

process.exit(verifyAll(OUT, files, 'graded quizzes') === 0 ? 0 : 1);
