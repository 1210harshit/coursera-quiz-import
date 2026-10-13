// Verifies the four Performance Management and Capstone Leadership (Course 5) MODULE GRADED QUIZ documents against
// quiz.json.
//
//     node src/agentic-teams-c5-verify.js work/agentic-teams-c5/dist
//
// The checks themselves live in agentic-teams-c5-docverify.js, shared with the practice
// quizzes and the final exam so that no family is verified more loosely than another.
const fs = require('fs');
const path = require('path');
const { verifyAll, SP } = require('./agentic-teams-c5-docverify');
const { referenceStyle } = require('./agentic-teams-c5-lib');

const OUT = process.argv[2];
const mods = JSON.parse(fs.readFileSync(path.join(SP, 'agentic-teams-c5', 'quiz.json'), 'utf8'));

const files = mods.map(quiz => ({
  quiz,
  refStyle: referenceStyle('graded', quiz.num),
  label: `Module ${quiz.num} graded quiz`,
  file: `Coursera_Import_Module_${quiz.num}_Graded_Quiz_Agentic_Teams_Course_5.docx`,
}));

process.exit(verifyAll(OUT, files, 'graded quizzes') === 0 ? 0 : 1);
