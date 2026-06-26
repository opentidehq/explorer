# OpenTide Explorer

Deployable static application for interactively exploring OpenTide objects — threats, objectives, signals, rules, and threat chains.

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

Clone OpenTide repos as siblings:

```text
OpenTide/
├── opentide/
├── library/
├── specifications/
├── website/
└── explorer/    ← you are here
```

When `library` and `explorer` are siblings, `opentide explorer build` and `dev` auto-detect `../explorer` with no extra configuration.

## Development

**Requirements:** Node ≥ 20.19, pnpm 9+, Next.js **16.2.9**

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

| Skill | Source | Use when |
|-------|--------|----------|
| `vercel-react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | React/Next.js performance, data fetching, bundle size |
| `vercel-composition-patterns` | vercel-labs/agent-skills | Component architecture, compound components |
| `vercel-react-view-transitions` | vercel-labs/agent-skills | View Transition API with Next.js |
| `next-dev-loop` | [vercel/next.js](https://github.com/vercel/next.js) | Verify runtime behavior during `next dev` |
| `next-cache-components-adoption` | vercel/next.js | Enabling Cache Components |

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

### Typography

The UI uses [Geist](https://vercel.com/font) (sans) and [Geist Mono](https://vercel.com/font) via `next/font`. No external font CDN is required at runtime.

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

| Priority | Env / flag | Behaviour |
|----------|------------|-----------|
| 1 | `EXPLORER_GIT_URL` / `--explorer-git` | Shallow-clone this repo |
| 2 | `EXPLORER_GIT_REF` / `--explorer-ref` | Branch, tag, or commit (default `main`) |
| 3 | `OPENTIDE_EXPLORER_PATH` / `--explorer-path` | Local checkout |
| 4 | Sibling `../explorer` | Auto-detected |
| 5 | `EXPLORER_VERSION` / `--version` | npm `npx @opentide/explorer@…` fallback |
| 6 | *(default)* | Clone `https://github.com/OpenTideHQ/explorer.git` @ `main` into `~/.cache/opentide/explorer-src/` |

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
    repository: OpenTideHQ/explorer
    ref: main
    path: explorer
- run: opentide explorer build --output ./out/explorer --base-path /library
  env:
    OPENTIDE_REPO_ROOT: ${{ github.workspace }}
    OPENTIDE_EXPLORER_PATH: ${{ github.workspace }}/explorer
```

### Serve mode corpus

When using `opentide explorer serve`, detection content is resolved separately:

| Env | Purpose |
|-----|---------|
| `OPENTIDE_REPO_ROOT` | Local corpus (default) |
| `EXPLORER_CORPUS_URL` | Remote git corpus URL |
| `EXPLORER_CORPUS_BRANCH` | Corpus branch (default `main`) |
| `EXPLORER_CORPUS_REF` | Corpus ref override |

## Features

- **Catalog** — sortable tables with ATT&CK tags, platform badges, related counts
- **Graph** — react-flow detection chain (TB) + threat chaining (LR) with focus-context detail panel
- **Coverage** — ATT&CK matrix from Navigator export, gap dashboard, platform rollup
- **Search** — cmdk palette with Orama full-text + structured filters (`type:rule`, `T1548.002`)
- **Detail panels** — per-type structured sections, platform query viewers (Shiki), YAML raw tab
- **Permalinks** — `/threats/[uuid]`, `/objectives/[uuid]`, `/rules/[uuid]`, `/signals/[uuid]`

## Upstream exports

Explorer consumes exports from `opentide generate explorer`:

| Export | Purpose |
|--------|---------|
| `explorer.bundle.json` | Object index + chaining adjacency |
| `explorer.coverage.json` | Technique matrix, signal gaps |
| `explorer.search.json` | Orama document list |
| `attack-navigator.json` | ATT&CK Navigator layer |
| `vocab.att&ck.json` | Slim ATT&CK vocabulary |

Until that phase ships in all environments, the mock generator builds compatible JSON from `library/objects/`.

## npm publish (optional)

The `publish.yml` workflow publishes to npm on GitHub Release. **Git checkout is the current distribution method** for OpenTideHQ projects; npm is reserved for future public consumption outside the monorepo.

## Related projects

| Project | Description |
|---------|-------------|
| [opentide](https://github.com/OpenTideHQ/opentide) | DetectionOps engine |
| [library](https://github.com/OpenTideHQ/library) | Public registry of published detection objects |
| [specifications](https://github.com/OpenTideHQ/specifications) | Normative schemas and metadata specs |
| [website](https://github.com/OpenTideHQ/website) | OpenTide documentation and public surfaces |
