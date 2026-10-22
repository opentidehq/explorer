# opentide Explorer

Deployable static application for interactively exploring opentide objects — threats, objectives, signals, rules, and threat chains — in the opentide.org design language: white and Pantone Reflex Blue in light mode, black and EU Yellow in dark, Inter and JetBrains Mono.

Distribution is **git-based** during development: the Python `opentide` CLI resolves this repository from a local path, sibling checkout, or shallow git clone. npm publish (`@opentide/explorer`) remains optional for future releases.

```bash
opentide explorer dev      # local preview (contributors)
opentide explorer build    # static export → out/explorer/
opentide explorer serve    # self-hosted static server
```

## Ecosystem

```text
specifications  →  schemas and object specs (source of truth)
opentide        →  validate, generate, deploy (engine)
library         →  published objects (content)
explorer        →  interactive UI (this repository)
website         →  static docs and marketing
```

## Monorepo layout

Clone opentide repos as siblings:

```text
opentide/
├── opentide/
├── library/
├── specifications/
├── website/
└── explorer/    ← you are here
```

When `library` and `explorer` are siblings, `opentide explorer build` and `dev` auto-detect `../explorer` with no extra configuration.

## Development

**Requirements:** Node ≥ 20.19, pnpm 9+, Next.js **16.3**

```bash
pnpm install
pnpm dev          # Turbopack dev server at http://localhost:3000
pnpm check        # typecheck, oxlint, oxfmt, vitest
pnpm validate     # check + production build (run before committing)
pnpm run doctor   # optional React health scan (advisory; may exit non-zero)
pnpm build        # generates data from ../library and static export
```

### Agent skills (Vercel)

Official Vercel Next.js agent skills are installed under [`.agents/skills/`](.agents/skills/) (tracked via [`skills-lock.json`](skills-lock.json)):

| Skill                            | Source                                                                  | Use when                                              |
| -------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| `vercel-react-best-practices`    | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | React/Next.js performance, data fetching, bundle size |
| `vercel-composition-patterns`    | vercel-labs/agent-skills                                                | Component architecture, compound components           |
| `vercel-react-view-transitions`  | vercel-labs/agent-skills                                                | View Transition API with Next.js                      |
| `next-dev-loop`                  | [vercel/next.js](https://github.com/vercel/next.js)                     | Verify runtime behavior during `next dev`             |
| `next-cache-components-adoption` | vercel/next.js                                                          | Enabling Cache Components                             |

Refresh skills: `npx skills update -p -y`

### MCP for agents (Next.js DevTools)

Next.js 16 exposes a built-in MCP endpoint at `/_next/mcp` when `pnpm dev` is running. The [`next-devtools-mcp`](https://www.npmjs.com/package/next-devtools-mcp) bridge is configured in [`.mcp.json`](.mcp.json) and [`.cursor/mcp.json`](.cursor/mcp.json):

```json
{
  "mcpServers": {
    "next-devtools": {
      "command": "npx",
      "args": ["-y", "next-devtools-mcp@latest"]
    }
  }
}
```

**Agent workflow:** start `pnpm dev`, then use MCP tools (`nextjs_index`, `nextjs_call`) to read build/runtime errors, routes, and logs before the user sees them. For UI verification, combine with the `next-dev-loop` skill and [agent-browser](https://github.com/vercel-labs/agent-browser).

Version-accurate Next.js docs ship in `node_modules/next/dist/docs/` (Next.js 16+).

Data is loaded from `public/data/*.json`. During local dev, `scripts/generate-mock-bundle.mjs` reads the sibling `library/objects/` corpus when present.

### Design

The UI follows [opentide.org](https://opentide.org): tokens in `app/globals.css` mirror the site's
`--landing-*` set, the header is the site's floating glass pill with the official logotype
(`components/brand/opentide-mark.tsx`, inlined so it follows the theme), content sits in 1px-bordered
panels on the band colour, and real artefacts (YAML, queries) render in deep-tide navy code panels.
Object types read as depth: threats are the slate landscape, objectives blue, signals foam, and
rules the amber light of a detection firing. Fonts load through `next/font` (Inter, JetBrains Mono).

### Build CLI

Invoked directly or via `opentide explorer build`:

```bash
node bin/build.mjs build \
  --exports-dir .opentide/exports \
  --schemas-dir .opentide/schemas \
  --output ./out/explorer \
  --base-path /library
```

## Git-based integration (opentide)

`opentide explorer build` resolves explorer source in this order:

| Priority | Env / flag                                   | Behaviour                                                                                          |
| -------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1        | `EXPLORER_GIT_URL` / `--explorer-git`        | Shallow-clone this repo                                                                            |
| 2        | `EXPLORER_GIT_REF` / `--explorer-ref`        | Branch, tag, or commit (default `main`)                                                            |
| 3        | `OPENTIDE_EXPLORER_PATH` / `--explorer-path` | Local checkout                                                                                     |
| 4        | Sibling `../explorer`                        | Auto-detected                                                                                      |
| 5        | `EXPLORER_VERSION` / `--version`             | npm `npx @opentide/explorer@…` fallback                                                            |
| 6        | _(default)_                                  | Clone `https://github.com/opentidehq/explorer.git` @ `main` into `~/.cache/opentide/explorer-src/` |

**Local development example:**

```bash
export OPENTIDE_REPO_ROOT=/path/to/library
export OPENTIDE_EXPLORER_PATH=/path/to/explorer
pip install -e ../opentide
opentide explorer build --output ./out/explorer --base-path /library
```

**CI example** (checkout explorer alongside your corpus repo):

```yaml
- uses: actions/checkout@v4
  with:
    repository: opentidehq/explorer
    ref: main
    path: explorer
- run: opentide explorer build --output ./out/explorer --base-path /library
  env:
    OPENTIDE_REPO_ROOT: ${{ github.workspace }}
    OPENTIDE_EXPLORER_PATH: ${{ github.workspace }}/explorer
```

### Serve mode corpus

When using `opentide explorer serve`, detection content is resolved separately:

| Env                      | Purpose                        |
| ------------------------ | ------------------------------ |
| `OPENTIDE_REPO_ROOT`     | Local corpus (default)         |
| `EXPLORER_CORPUS_URL`    | Remote git corpus URL          |
| `EXPLORER_CORPUS_BRANCH` | Corpus branch (default `main`) |
| `EXPLORER_CORPUS_REF`    | Corpus ref override            |

## Features

- **Graph** — the corpus on a WebGL canvas (sigma.js): detection edges down the ontology, threat
  chaining between threats. Hover or pick an object and its chain lights up with moving dashes and
  the field each link travels on (`threats`, `signals[]`, `detection_model`). ForceAtlas2 runs in a
  web worker, so the layout never blocks the page; kill-chain bands and vocabulary values are layers.
- **Catalogue** — threats, the objectives that cover them (with their signals) and the rules that
  implement them, in three columns. Threats with an objective come first; the rest are the gaps.
  Selecting an object pulls its chain to the top and draws connectors across the columns.
- **ATT&CK** — Enterprise, ICS and Mobile matrices as a heatmap: techniques filled by how many
  objectives, signals and rules detect them, threat-only techniques marked as gaps.
- **Search** — free text plus `field:value` clauses (`type:rule technique:T1059 platform:sentinel`)
  and `field!=value` exclusions (`type!=rule`), with suggestions from the corpus and its
  vocabularies. Reach and deployment are clauses too (`reach:chains`, `deploy:staging`), set by the
  rail's reach control; any other word is text. ⌘K jumps to any object.
- **Inspector** — each object's description, facts, ATT&CK techniques, vocabulary values with their
  definitions, rule queries per integration, its links read from the fields that hold them, and its
  YAML with a link to the file at the bundle's commit. With nothing selected it shows the library's
  coverage, integrations and most-chained threats.
- **Permalinks** — `/threats/[uuid]/`, `/objectives/[uuid]/`, `/signals/[uuid]/`, `/rules/[uuid]/`
  open the explorer on that object, with per-object titles and descriptions for link previews. The
  address bar tracks the selection (`?o=`), view (`?v=`) and search (`?q=`); Back returns to the
  previous object.

## Data

The client fetches two files from `public/data/`, both preloaded with the HTML:

| File                   | Written by                         | Contents                                                                                                                                                                                             |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `explorer.bundle.json` | `scripts/generate-mock-bundle.mjs` | Every object once (`flatIndex`), summaries, chaining, deployments, and the corpus repository and commit                                                                                              |
| `explorer.vocab.json`  | `scripts/generate-mock-bundle.mjs` | The vocabulary terms the client reads: every ATT&CK technique, the small vocabularies whole, and of the large catalogues (actors, groups, malware) only the terms the corpus names, each stored once |

`vocab.index.json` (the full index from `pnpm codegen:specs`, ~15 MB) is the fallback when
`explorer.vocab.json` is absent; bundles from older generators that ship `models` and `signals`
beside `flatIndex` still load.

## Upstream exports

`opentide explorer build` (see `bin/build.mjs`) copies `explorer.bundle.json` from the exports
directory, and `explorer.vocab.json` or `vocab.index.json` when present.

## npm publish (optional)

The `publish.yml` workflow publishes to npm on GitHub Release. **Git checkout is the current distribution method** for opentidehq projects; npm is reserved for future public consumption outside the monorepo.

## Related projects

| Project                                                        | Description                                    |
| -------------------------------------------------------------- | ---------------------------------------------- |
| [opentide](https://github.com/opentidehq/opentide)             | DetectionOps engine                            |
| [library](https://github.com/opentidehq/library)               | Public registry of published detection objects |
| [specifications](https://github.com/opentidehq/specifications) | Normative schemas and metadata specs           |
| [website](https://github.com/opentidehq/website)               | opentide documentation and public surfaces     |
