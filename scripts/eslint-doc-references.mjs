// ESLint rule `local/doc-references`: the comment rule of CLAUDE.md ("Comments") on every comment
// of a TypeScript or JavaScript file, and its part on test names: a `describe`, `it` or `test`
// name carries no history tag, and one that holds a bare reference (`8.4`, `R-BOOK-02`, `AC-22`)
// needs a "Test names:" comment naming the document(s), above its outermost `describe`. The
// checks themselves are in doc-references.mjs.
import { findProblems } from './doc-references.mjs';

const TEST_FUNCTIONS = new Set(['describe', 'it', 'test']);
const HEADER = /^\s*Test names:/;

// The test function a call names: `describe(…)`, `it.only(…)`, `describe.each(table)(…)`.
function testFunction(call) {
  let callee = call.callee;
  while (callee) {
    if (callee.type === 'Identifier') return TEST_FUNCTIONS.has(callee.name) ? callee.name : null;
    if (callee.type === 'MemberExpression') callee = callee.object;
    else if (callee.type === 'CallExpression') callee = callee.callee;
    else return null;
  }
  return null;
}

// The name a test call is given, when it is written out: a string, or a template's fixed parts.
function testName(call) {
  const arg = call.arguments[0];
  if (!arg) return null;
  if (arg.type === 'Literal' && typeof arg.value === 'string') return arg.value;
  if (arg.type === 'TemplateLiteral') return arg.quasis.map((q) => q.value.cooked).join(' ');
  return null;
}

const rule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Comments name the document they refer to and carry no history tag' },
    schema: [],
  },
  create(context) {
    const source = context.sourceCode;
    // The outermost test calls already reported for a missing "Test names:" comment, once each.
    const reportedHeaders = new Set();

    // The "Test names:" comment above `call`'s statement: its joined text, or null.
    const headerOf = (call) => {
      const statement = call.parent.type === 'ExpressionStatement' ? call.parent : call;
      const comments = source.getCommentsBefore(statement);
      const start = comments.findLastIndex((c) => HEADER.test(c.value));
      return start === -1 ? null : comments.slice(start).map((c) => c.value).join(' ');
    };

    return {
      Program() {
        // Consecutive `//` lines are one comment: a sentence can run over several of them.
        const blocks = [];
        for (const c of source.getAllComments()) {
          const last = blocks.at(-1);
          const joins = last && c.type === 'Line' && last.type === 'Line' && c.loc.start.line === last.endLine + 1;
          if (joins) {
            last.parts.push({ comment: c, offset: last.text.length + 1 });
            last.text += ' ' + c.value;
            last.endLine = c.loc.end.line;
          } else {
            blocks.push({ type: c.type, text: c.value, endLine: c.loc.end.line, parts: [{ comment: c, offset: 0 }] });
          }
        }
        for (const block of blocks) {
          for (const p of findProblems(block.text)) {
            const part = block.parts.findLast((x) => x.offset <= p.index);
            const markerLength = 2; // `//` or `/*`
            const at = part.comment.range[0] + markerLength + (p.index - part.offset);
            context.report({ loc: source.getLocFromIndex(at), message: p.message });
          }
        }
      },

      CallExpression(call) {
        if (!testFunction(call)) return;
        const name = testName(call);
        if (name === null) return;
        const problems = findProblems(name);
        for (const p of problems.filter((x) => x.kind === 'history' || x.kind === 'missing')) {
          context.report({ node: call.arguments[0], message: `test name: ${p.message}` });
        }
        if (!problems.some((x) => x.kind === 'bare' || x.kind === 'nickname')) return;
        // The outermost `describe` around this call, or the call itself at the top level.
        const outer = source.getAncestors(call).find((n) => n.type === 'CallExpression' && testFunction(n) === 'describe') ?? call;
        if (reportedHeaders.has(outer)) return;
        const header = headerOf(outer);
        const names = header && /\b(?:docs\/)?[A-Z][A-Z0-9_]*\.md\b/.test(header);
        if (!names) {
          reportedHeaders.add(outer);
          context.report({
            node: outer.arguments[0] ?? outer,
            message:
              'a test name inside holds a bare reference: put a "Test names: … docs/<NAME>.md" comment ' +
              'above this outermost describe, naming the document(s) its references point to',
          });
        }
      },
    };
  },
};

export default { rules: { 'doc-references': rule } };
