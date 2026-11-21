---
paths:
  - "**/*.md"
---

# Diagrams

Applies to every Mermaid diagram in a Markdown file. A diagram must be easy to read in VS Code's
Markdown Preview, in a dark editor theme as in a light one: dark text on a light background,
no label printed over another.

- Every diagram starts with `%%{init: {'theme': 'default'}}%%` as the first line inside the
  block.
- **A sequence diagram** puts all its participants and actors inside one
  `box rgb(250, 250, 247)` … `end`, which gives the light panel. Nothing may stick out of it to
  the left or the right: no `alt`, `opt` or `loop` made only of a participant's messages to
  itself at an edge of the diagram; say it with a `Note over` two participants.
- **A flowchart** has every node inside a `subgraph`, and one outer `subgraph` around the
  whole diagram when it has several groups: the light frame must hold every node and every
  arrow, since an arrow drawn on the page's own background is dark on dark.
- **States** are drawn as such a flowchart. Not `stateDiagram-v2`: its long labels overlap.
- **A label on an arrow is a few words.** When more must be said, the arrow carries a number
  and a word and a table under the diagram explains each number. An arrow from a node to
  itself is written in the node's label, not drawn.
- No `;` and no `#` in a diagram's text: Mermaid reads them as syntax.
- Check a new or changed diagram by rendering the file on a dark page and looking at each
  picture: `npx --yes @mermaid-js/mermaid-cli@11 -i <file.md> -o <scratch folder>/d.png -b '#1e1e1e'`.
  The pictures go to a scratch folder, never into the repository.

The diagrams of `docs/CONVERSATIONAL_ARCHITECTURE.md` follow this rule and serve as examples.
