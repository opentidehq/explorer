# Changelog

Notable changes to the opentide explorer, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html); before 1.0, a minor version may change the CLI and the export format it reads.

Each version's first paragraph is its summary: the GitHub Release and [opentide.org/releases](https://opentide.org/releases/explorer/) show it above the change lists. Versions before 0.5.0 were tagged after the fact, on the commit each one shipped as; they were not published to npm.

## [0.5.0] - 2026-10-26

The explorer is an npm package: `npx @opentide/explorer serve --exports-dir .opentide/exports` builds a corpus's explorer and serves it on localhost, with no checkout of this repository.

### Added

- `opentide-explorer serve`: builds the explorer for a corpus's exports, then serves it from a dependency-free local server. `--dir` serves an existing build; `--port` and `--host` choose where it listens.
- `opentide-explorer build` runs from the npm package as well as from a git checkout. `opentide-explorer-build build` stays as the older name.
- React component tests in happy-dom, beside a faster unit run ([#78](https://github.com/opentidehq/explorer/pull/78)).

### Changed

- The graph view runs on sigma 4 ([#75](https://github.com/opentidehq/explorer/pull/75)).
- Search keeps an object's status apart from its deployment, and search and the ATT&CK matrix resolve techniques the same way ([#76](https://github.com/opentidehq/explorer/pull/76)).
- Type checking runs on tsrs, and linting and formatting on oxlint and oxfmt ([#72](https://github.com/opentidehq/explorer/pull/72)).

### Fixed

- Search: `AND`, `OR`, and quoted phrases do what they say ([#74](https://github.com/opentidehq/explorer/pull/74)).
- Every signal has a permalink, and the bundle follows the rule and signal specifications ([#74](https://github.com/opentidehq/explorer/pull/74)).
- Hiding a large vocabulary layer rebuilds the graph once ([#75](https://github.com/opentidehq/explorer/pull/75)).
- Catalogue and prose links: only absolute `http(s)` URLs stay clickable ([#66](https://github.com/opentidehq/explorer/pull/66)).

## [0.4.0] - 2026-10-14

The explorer takes the opentide.org design language: the site's tokens, glass header, and logotype, with object types read as depth.

### Changed

- Redesign in the opentide.org design language: white and Pantone Reflex Blue in light mode, black and EU Yellow in dark, Inter and JetBrains Mono ([#59](https://github.com/opentidehq/explorer/pull/59)).
- Next.js 16.3.8 ([#54](https://github.com/opentidehq/explorer/pull/54)).

### Fixed

- js-yaml raised past GHSA-r3ph-w7gj-g6xm ([#62](https://github.com/opentidehq/explorer/pull/62)).

## [0.3.0] - 2026-09-17

Object pages stay small: the catalogue loads once on the client instead of inlining into every page, so a full corpus fits GitHub Pages.

### Changed

- The catalogue JSON loads on the client instead of inlining into each static page.

### Fixed

- Threat actors are collected from objects, objectives read `objective.attack`, and schema codegen fails when specifications are present but unreadable.
- Threat actor pills show one pill per actor instead of `[object Object]`.
- CI falls back to `GITHUB_TOKEN` when the GitHub App secrets are absent, so forks and Dependabot can check out the public corpus.
- Next.js 16.3.3 and patched vitest and PostCSS advisories ([#46](https://github.com/opentidehq/explorer/pull/46)).

## [0.2.0] - 2026-07-01

Three ways to read a corpus: the graph, a catalogue list, and an ATT&CK matrix, with token search kept in sync across them.

### Added

- Graph, list, and ATT&CK matrix views.
- Token search with filters synced to the URL, vocabulary-aware graph layers, and a field registry generated from the schemas.
- An overhauled object detail panel.

### Fixed

- Command palette selection, kill-chain camera stability, and search bar state.

## [0.1.0] - 2026-06-27

The first explorer: a search-first WebGL graph of a corpus's threats, objectives, signals, and rules, exported as a static site.

### Added

- A full-width sigma graph with Orama filters and a slide-in detail panel, on Next.js 16.
- A static export the `opentide` CI can build for GitHub Pages, and a fixture corpus for hermetic builds.
- A persisted dark and light theme.

[0.5.0]: https://github.com/opentidehq/explorer/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/opentidehq/explorer/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/opentidehq/explorer/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/opentidehq/explorer/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/opentidehq/explorer/releases/tag/v0.1.0
