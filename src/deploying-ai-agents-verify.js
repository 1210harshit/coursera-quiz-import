// Verifies the four Deploying and Orchestrating AI Agents MODULE GRADED QUIZ documents against
// quiz.json.
//
//     node src/deploying-ai-agents-verify.js work/deploying-ai-agents/dist
//
// The checks themselves live in deploying-ai-agents-docverify.js, shared with the practice
// quizzes and the final exam so that no family is verified more loosely than another.
const fs = require('fs');
const path = require('path');
const { verifyAll, SP } = require('./deploying-ai-agents-docverify');
const { referenceStyle } = require('./deploying-ai-agents-lib');

const OUT = process.argv[2];
const mods = JSON.parse(fs.readFileSync(path.join(SP, 'deploying-ai-agents', 'quiz.json'), 'utf8'));

const files = mods.map(quiz => ({
  quiz,
  refStyle: referenceStyle('graded', quiz.num),
  label: `Module ${quiz.num} graded quiz`,
  file: `Coursera_Import_Module_${quiz.num}_Graded_Quiz_Deploying_AI_Agents.docx`,
}));

process.exit(verifyAll(OUT, files, 'graded quizzes') === 0 ? 0 : 1);
