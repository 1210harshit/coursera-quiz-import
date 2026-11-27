// Checks that every delivered file can actually be OPENED on Windows.
//
//     node src/check-output-paths.js
//
// WHY THIS EXISTS. GenAIOps Course 4 was delivered into
// "Optimizing Cost, Latency, and Performance (GenAIOps Course 4) Practice Quizzes (9 lessons)",
// which put its nine practice quizzes at 270-character full paths. Windows' MAX_PATH is 260,
// and past it a browser's file-picker cannot open the file at all — so the upload never starts
// and Coursera never sees a thing. The documents were correct; they were simply unreachable.
// Nothing in the build can catch this, because the build writes into work/<slug>/dist*/ where
// the paths are short. It only appears once the files are copied into output/.
//
// The limit is a property of the DELIVERY PATH, not of the course: the same documents under a
// shorter folder name are fine. Courses with a long title are the ones at risk, since the
// folder name carries the title and the file name carries the course number.
const fs = require('fs');
const path = require('path');

const LIMIT = 260;          // Windows MAX_PATH
const WARN_AT = 245;        // close enough that one more word in a name would break it

const root = path.resolve(__dirname, '..', '..', 'output');
if (!fs.existsSync(root)) {
  console.error(`no output directory at ${root}`);
  process.exit(2);
}

const rows = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else rows.push(path.win32.normalize(path.resolve(p)));
  }
})(root);

const over = rows.filter(p => p.length > LIMIT).sort((a, b) => b.length - a.length);
const near = rows.filter(p => p.length > WARN_AT && p.length <= LIMIT).sort((a, b) => b.length - a.length);

const longest = rows.reduce((m, p) => Math.max(m, p.length), 0);
console.log(`${rows.length} delivered files · longest path ${longest} chars · limit ${LIMIT}`);

if (near.length) {
  console.log(`\n${near.length} within ${LIMIT - WARN_AT} chars of the limit:`);
  for (const p of near.slice(0, 10)) {
    console.log(`  ${p.length}  ${path.basename(path.dirname(p))}`);
  }
}

if (over.length) {
  console.log(`\n${over.length} file(s) OVER the limit — these cannot be opened from a file picker:`);
  const byFolder = {};
  for (const p of over) {
    const d = path.dirname(p);
    byFolder[d] = (byFolder[d] || 0) + 1;
  }
  for (const [d, n] of Object.entries(byFolder)) {
    const worst = over.filter(p => path.dirname(p) === d)[0];
    console.log(`  ${n} file(s) in "${path.basename(d)}"`);
    console.log(`      longest is ${worst.length} chars; shorten the folder name by at least `
      + `${worst.length - LIMIT} to fix it`);
  }
  process.exit(1);
}

console.log('\nOK — every delivered file is inside MAX_PATH.');
