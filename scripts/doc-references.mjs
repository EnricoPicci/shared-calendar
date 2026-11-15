// The comment rule of CLAUDE.md ("Comments"): a comment that points at the documentation names the
// document by its path, in the same sentence as the item it points at, and carries no history tag.
// This module finds the comments that break it; eslint-doc-references.mjs (TypeScript, JavaScript)
// and check-doc-references.mjs (shell, YAML, TOML) report what it finds. It cannot judge whether a
// comment is clear, only whether its references can be followed.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// A document path as a comment must write it: `docs/ARCHITECTURE.md`, or a root file such as
// `README.md` or `CLAUDE.md`.
const DOC = /\b(?:docs\/)?[A-Z][A-Z0-9_]*\.md\b/g;

// Items inside a document: they need a document path earlier in the same sentence.
const ITEMS = [
  /\bsections?\s+\d+(?:\.\d+)*/gi,
  /§\s*\d/g,
  /\bdecisions?\s+[A-Z]?\d+/gi,
  /\brules?\s+\d+/gi,
  /\bsteps?\s+\d+/gi,
  /\bjourneys?\s+\d+/gi,
  /\broutes?\s+\d+/gi,
  /\bR-[A-Z]+-\d+/g,
  /\bAC-\d+/g,
  // Labelled items: decisions D… and T… (docs/SHARED_CALENDAR_SPEC.md), requirements F… and N…
  // (docs/ARCHITECTURE.md), assumptions A…, open points O… and approved changes P….
  /\b[DTFNAOP]\d{1,2}\b/g,
  // A bare section number (two numbers joined by a dot). Not a quantity (`0.75 GB`, `1.5 s`),
  // a version (`1.171.0`), or a version after the name of what it versions (`bash 3.2`,
  // `payload format 2.0`).
  /(?<![\d.])(?<!\b(?:bash|zsh|[Nn]ode|SAM(?: CLI)?|[Pp]ayload(?: format)?|[Vv]ersion|TLS|HTTP|OAuth|ES)\s)\d{1,2}\.\d{1,2}(?![\d.]|\s*(?:GB|MB|KB|ms|s|%|USD|x|h|min)\b)/g,
];

// Always refused, document path or not.
const REFUSED = [
  // The history of the code is in git and in the documents' version notes, not in comments.
  { kind: 'history', re: /\bv(?!1\b|8\b)\d+\b/g, why: 'history tag (vN): describe the code as it is now' },
  { kind: 'history', re: /\bbriefs?\s+\d+/gi, why: 'history tag (brief N): describe the code as it is now' },
  {
    kind: 'history',
    // `v1` and `v8` are allowed alone above (the product release, the V8 engine), not as tags.
    re: /\b(?:spec|specification|architecture|plan)\s+v[18]\b|\(v[18]\)/gi,
    why: 'history tag (vN): describe the code as it is now',
  },
  {
    kind: 'history',
    re: /\bsince\s+(?:plan\s+)?step\b/gi,
    why: 'history tag (since step N): describe the code as it is now',
  },
  // A document's nickname before an item: write its path instead.
  {
    kind: 'nickname',
    re: /\b(?:spec|specification|architecture|plan|the services document)(?:'s)?\s+(?:section\s+|step\s+|decision\s+|rule\s+)?(?:\d|R-|AC-|[DT]\d)/gi,
    why: 'document named by a nickname: write its path (docs/<NAME>.md)',
  },
];

// Sentences end at `.`, `;`, `!` or `?` followed by white space (a document path has no space
// after the dot of `.md`).
function sentences(text) {
  const out = [];
  let start = 0;
  for (const m of text.matchAll(/[.;!?](?=\s)/g)) {
    out.push({ start, text: text.slice(start, m.index + 1) });
    start = m.index + 1;
  }
  out.push({ start, text: text.slice(start) });
  return out;
}

/**
 * The problems in one comment's text (the comment markers removed or not: they match nothing).
 * Each problem is `{ index, kind, message }`: `index` an offset into `text`; `kind` one of
 * `missing` (a document that does not exist), `bare` (an item without its document), `nickname`
 * (a document named by a nickname) and `history` (a history tag).
 */
export function findProblems(text) {
  const problems = [];
  for (const m of text.matchAll(DOC)) {
    const path = m[0];
    if (!existsSync(join(ROOT, path))) problems.push({ index: m.index, kind: 'missing', message: `no such document: ${path}` });
  }
  for (const s of sentences(text)) {
    const docs = [...s.text.matchAll(DOC)].map((m) => m.index);
    for (const re of ITEMS) {
      for (const m of s.text.matchAll(re)) {
        if (!docs.some((d) => d < m.index)) {
          problems.push({
            index: s.start + m.index,
            kind: 'bare',
            message: `"${m[0].trim()}" without a document: write docs/<NAME>.md earlier in the same sentence`,
          });
        }
      }
    }
  }
  for (const { kind, re, why } of REFUSED) {
    for (const m of text.matchAll(re)) problems.push({ index: m.index, kind, message: `"${m[0].trim()}": ${why}` });
  }
  return problems.sort((a, b) => a.index - b.index);
}
