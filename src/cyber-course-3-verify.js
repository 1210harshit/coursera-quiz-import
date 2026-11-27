// Verifies the four Threat Response, Hunting, and Security Operations MODULE GRADED QUIZ documents against
// quiz.json.
//
//     node src/cyber-course-3-verify.js work/cyber-course-3/dist
//
// The checks themselves live in cyber-course-3-docverify.js, shared with the practice
// quizzes and the final exam so that no family is verified more loosely than another.
const fs = require('fs');
const path = require('path');
const { verifyAll, SP } = require('./cyber-course-3-docverify');
const { referenceStyle } = require('./cyber-course-3-lib');

const OUT = process.argv[2];
const mods = JSON.parse(fs.readFileSync(path.join(SP, 'cyber-course-3', 'quiz.json'), 'utf8'));

const files = mods.map(quiz => ({
  quiz,
  refStyle: referenceStyle('graded', quiz.num),
  label: `Module ${quiz.num} graded quiz`,
  file: `Coursera_Import_Module_${quiz.num}_Graded_Quiz_Cybersecurity_Course_3.docx`,
}));

process.exit(verifyAll(OUT, files, 'graded quizzes') === 0 ? 0 : 1);
