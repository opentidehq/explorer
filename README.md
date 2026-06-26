# OpenTide Explorer

Deployable application for interactively exploring OpenTide objects — threats, objectives, rules, queries, and chains.

This repository ships the **OpenTide Explorer** product source. It is not a hosted service; teams run their own instance against any OpenTide corpus (for example [library](https://github.com/OpenTideHQ/library) or a client `objects/` workspace).

## Ecosystem

```text
specifications  →  schemas and object specs (source of truth)
opentide        →  validate, generate, deploy (engine)
library         →  published objects (content)
explorer        →  interactive app + API + MCP (this repository)
website         →  static docs and marketing
```

## Monorepo layout (recommended)

Clone OpenTide repos as siblings:

```text
OpenTide/
├── opentide/
├── library/
├── specifications/
├── website/
└── explorer/    ← you are here
```

## Status

Early scaffolding — application code, API, and MCP packages will land here.

## Related projects

| Project | Description |
|---------|-------------|
| [opentide](https://github.com/OpenTideHQ/opentide) | DetectionOps engine |
| [library](https://github.com/OpenTideHQ/library) | Public registry of published detection objects |
| [specifications](https://github.com/OpenTideHQ/specifications) | Normative schemas and metadata specs |
| [website](https://github.com/OpenTideHQ/website) | OpenTide documentation and public surfaces |
