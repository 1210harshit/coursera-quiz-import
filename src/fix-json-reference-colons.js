// Applies the one-colon-per-reference rule to a parsed JSON intermediate, so the builder and
// the verifier agree about what a reference should say.
//
//     node src/fix-json-reference-colons.js <file.json> ...
//
// WHY NOT JUST RE-PARSE. The rule lives in each course library's finish(), so re-running the
// parser would apply it — but re-parsing also re-resolves every citation against the current
// outline, and some delivered JSON predates changes to its syllabus. Agentic Teams Course 1 is
// the example: its M1L3 practice quiz cites "Manager FAQ Guide", which the outline no longer
// has, so a fresh parse drops the references that shipped with question 5. Rewriting the
// stored JSON changes the punctuation and nothing else.
//
// Two fields carry a reference. `shown` is the title as the learner reads it, and every colon
// in it becomes an en dash. `ref` is the whole line — "Module 1 Lesson 3 Reading: <shown>" —
// where the FIRST colon introduces the title and must stay.
const fs = require('fs');

const fixShown = s => String(s).replace(/\s*:\s*/g, ' – ');
const fixRef = s => {
  const i = String(s).indexOf(':');
  return i < 0 ? s : String(s).slice(0, i + 1) + fixShown(String(s).slice(i + 1));
};

let changed = 0;
function walk(node) {
  if (Array.isArray(node)) { node.forEach(walk); return; }
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string') {
      if (k === 'shown') { const n = fixShown(v); if (n !== v) { node[k] = n; changed++; } }
      else if (k === 'ref') { const n = fixRef(v); if (n !== v) { node[k] = n; changed++; } }
    } else walk(v);
  }
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node src/fix-json-reference-colons.js <file.json> ...');
  process.exit(2);
}
for (const f of files) {
  changed = 0;
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  walk(data);
  if (changed) fs.writeFileSync(f, JSON.stringify(data, null, 2));
  console.log(`  ${changed ? String(changed).padStart(4) + ' field(s) rewritten' : '   already clean    '}  ${f.split(/[\\/]/).pop()}`);
}
