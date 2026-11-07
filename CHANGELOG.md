# Changelog

Notable changes to the opentide explorer, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html); before 1.0, a minor version may change the CLI and the export format it reads.

Each version's first paragraph is its summary: the GitHub Release and [opentide.org/releases](https://opentide.org/releases/explorer/) show it above the change lists. How to write a version: [`.agents/skills/release-notes/SKILL.md`](.agents/skills/release-notes/SKILL.md). Versions before 0.5.0 were tagged after the fact, on the commit each one shipped as; they were not published to npm.

## [Unreleased]

The opentide language server runs in the browser. Queries and object files are coloured by its semantic tokens, hovering a token explains it, and a checks tab lists what the server finds in each object.

### Added

- **Queries and object YAML are coloured by the opentide language server.** The File tab and each rule query panel show the server's semantic tokens. The server is the language-server's `opentide-wasm` build, run in a web worker, and each query is read in its platform's profile ([#93](https://github.com/opentidehq/explorer/issues/93)).
- **Hovering a token shows what the server knows about it.** For example: a table and its columns, a column, an operator or function, a Tide field, or the object a reference names.
- **A checks tab lists the server's findings for each object.** The findings are schema errors, references, and query errors such as `kql_unknown_operator`. Each finding is underlined in the code panels, and picking one opens the File tab at its line.
- **`opentide-explorer build` includes the language server.** The npm package ships the pinned release (`scripts/language-server.json`); a checkout downloads it and checks its sha256, and a build that cannot get it continues without it. `OPENTIDE_LSP_WASM_DIR` uses a local build instead.

## [0.6.0] - 2026-11-06

A Visibility view shows the telemetry a library declares and the detections that use it, when the library exports it with `opentide generate explorer --include-visibility`.

### Added

- **A Visibility view for the log sources a library declares.** Tiles count log sources, those without columns, those no detection uses and datasets rules read that none declares; cards filter by search and system; each log source's page lists its columns and the rules and objectives that use it, under the export's TLP ([#85](https://github.com/opentidehq/explorer/issues/85)).
- **The inspector links a detection to its log sources.** A rule, signal or objective lists the log sources it uses and how, each opening its page; key `4` and the command palette open the view.
- **`opentide-explorer build` publishes the visibility export only while it exists.** It copies `explorer.visibility.json` when the exports have it and removes an earlier copy when they do not; without it there is no Visibility view, and an address that names it opens the graph.

## [0.5.1] - 2026-10-27

`npx @opentide/explorer serve` works: 0.5.0 shipped two commands, so npx could not tell which to run and stopped with "could not determine executable to run".

### Upgrade

- If a script runs `opentide-explorer-build build`, run `opentide-explorer build` instead.

### Breaking

- **The `opentide-explorer-build` alias is removed.** The package has one command, `opentide-explorer`, which is what `npx @opentide/explorer` runs.

### Fixed

- **`npx @opentide/explorer` runs the explorer** instead of failing with "could not determine executable to run".

## [0.5.0] - 2026-10-26

The explorer is an npm package: `npx @opentide/explorer serve --exports-dir .opentide/exports` builds a corpus's explorer and serves it on localhost, with no checkout of this repository.

### Added

- **`opentide-explorer serve` builds and serves a corpus's explorer.** It serves the build from a dependency-free local server; `--dir` serves an existing build, and `--port` and `--host` choose where it listens.
- **`opentide-explorer build` runs from the npm package**, as well as from a git checkout. `opentide-explorer-build build` stays as the older name.

### Changed

- **The graph view runs on sigma 4** ([#75](https://github.com/opentidehq/explorer/pull/75)).
- **Search keeps an object's status apart from its deployment**, and search and the ATT&CK matrix resolve techniques the same way ([#76](https://github.com/opentidehq/explorer/pull/76)).

### Fixed

- **Search: `AND`, `OR` and quoted phrases do what they say** ([#74](https://github.com/opentidehq/explorer/pull/74)).
- **Every signal has a permalink**, and the bundle follows the rule and signal specifications ([#74](https://github.com/opentidehq/explorer/pull/74)).
- **Hiding a large vocabulary layer rebuilds the graph once** ([#75](https://github.com/opentidehq/explorer/pull/75)).
- **Only absolute `http(s)` URLs stay clickable** in the catalogue and in prose ([#66](https://github.com/opentidehq/explorer/pull/66)).

## [0.4.0] - 2026-10-14

The explorer takes the opentide.org design language: the site's tokens, glass header and logotype, with object types read as depth.

### Changed

- **The explorer uses the opentide.org design language**: white and Pantone Reflex Blue in light mode, black and EU Yellow in dark, Inter and JetBrains Mono ([#59](https://github.com/opentidehq/explorer/pull/59)).
- **The explorer builds with Next.js 16.3.8** ([#54](https://github.com/opentidehq/explorer/pull/54)).

### Security

- **js-yaml is raised past GHSA-r3ph-w7gj-g6xm** ([#62](https://github.com/opentidehq/explorer/pull/62)).

## [0.3.0] - 2026-09-17

Object pages stay small: the catalogue loads once on the client instead of inlining into every page, so a full corpus fits GitHub Pages.

### Changed

- **The catalogue loads once, on the client**, instead of inlining into each static page.

### Fixed

- **Threat actors are collected from objects**, and objectives read `objective.attack`.
- **One pill per threat actor**, instead of `[object Object]`.
- **Schema code generation fails when the specifications are present but unreadable.**

### Security

- **Next.js 16.3.3, with the vitest and PostCSS advisories patched** ([#46](https://github.com/opentidehq/explorer/pull/46)).

## [0.2.0] - 2026-07-01

Three ways to read a corpus: the graph, a catalogue list and an ATT&CK matrix, with token search kept in sync across them.

### Added

- **Graph, list and ATT&CK matrix views.**
- **Token search** with filters synced to the URL, vocabulary-aware graph layers, and a field registry generated from the schemas.
- **An overhauled object detail panel.**

### Fixed

- **Command palette selection, kill-chain camera stability and the search bar's state.**

## [0.1.0] - 2026-06-27

The first explorer: a search-first WebGL graph of a corpus's threats, objectives, signals and rules, exported as a static site.

### Added

- **A full-width graph of the corpus**, with Orama filters and a slide-in detail panel.
- **A static export for GitHub Pages**, which the `opentide` CI can build.
- **Dark and light themes**, remembered between visits.

[0.6.0]: https://github.com/opentidehq/explorer/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/opentidehq/explorer/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/opentidehq/explorer/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/opentidehq/explorer/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/opentidehq/explorer/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/opentidehq/explorer/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/opentidehq/explorer/releases/tag/v0.1.0
