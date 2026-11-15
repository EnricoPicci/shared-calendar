// The comment rule of CLAUDE.md ("Comments") on the `#` comments of the files ESLint does not read:
// shell scripts, YAML, TOML and the dot-files. Checks the git-tracked (and new, not ignored) files
// under the current directory; prints `file:line: message` per problem and exits 1 if there is one.
// The checks themselves are in doc-references.mjs.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { findProblems } from './doc-references.mjs';

const PATTERN = /(\.(sh|ya?ml|toml)|(^|\/)\.(gitignore|editorconfig|nvmrc))$/;

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => PATTERN.test(f));

let count = 0;
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  // A comment: from a `#` at the start of a line or after white space, outside quotes (a
  // simple scan: enough for these files), to the end of the line. A shebang is not one.
  const comments = lines.map((line, i) => {
    if (i === 0 && line.startsWith('#!')) return null;
    let quote = null;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (quote) {
        if (ch === '\\' && quote === '"') j++;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '#' && (j === 0 || /\s/.test(line[j - 1]))) return line.slice(j + 1);
    }
    return null;
  });
  // Consecutive comment lines are one comment, as in the ESLint rule.
  for (let i = 0; i < comments.length; i++) {
    if (comments[i] === null) continue;
    const start = i;
    const offsets = [];
    let text = '';
    while (i < comments.length && comments[i] !== null) {
      offsets.push(text.length);
      text += comments[i] + ' ';
      i++;
    }
    for (const p of findProblems(text)) {
      const line = start + offsets.findLastIndex((o) => o <= p.index) + 1;
      console.log(`${file}:${line}: ${p.message}`);
      count++;
    }
  }
}
if (count > 0) {
  console.log(`\n${count} comment problem(s): see CLAUDE.md, "Comments".`);
  process.exit(1);
}
