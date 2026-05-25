# code-learner

Claude Code plugin for codebase analysis, onboarding, and pull request understanding. Analyzes repository structure, module boundaries, cross-module relationships, produces structured onboarding guides, and generates detailed PR/MR analysis documents.

<img width="600" alt="image" src="https://github.com/user-attachments/assets/c22eb7fd-6458-41af-b399-6dc3016af6a1" />


## Installation

```bash
# Add the marketplace
claude plugin marketplace add https://github.com/aireilly/code-learner.git

# Install the plugin
claude plugin install code-learner@code-learner
```

### Prerequisites

- **Node.js** — required for Go, JavaScript, and TypeScript AST extraction (tree-sitter dependencies are installed automatically by the plugin installer)
- **Python 3.10+** — required for detection and module-mapping scripts (no pip dependencies)

## Skills

### learn-code

Analyzes a codebase end-to-end and produces a structured onboarding guide.

```
/code-learner:learn-code /path/to/repo
/code-learner:learn-code https://github.com/user/repo
/code-learner:learn-code git@github.com:user/repo.git
/code-learner:learn-code /path/to/repo --exclude "vendor/*" "test/*"
```

| Option | Description |
|--------|-------------|
| `--exclude <glob>...` | Glob patterns to exclude from analysis |

The pipeline runs five steps sequentially, dispatching parallel agents in batches of up to 10. Modules are classified into analysis tiers (full source, API-guided, or API-only) based on size and complexity to stay within agent context limits. Progress is tracked in a JSON file so interrupted runs can resume.

### query-code

Answers natural-language questions about a previously analyzed codebase. Dispatches an agent that reads the analysis output and can also inspect the actual source code to provide answers grounded with `file:line` references.

```
/code-learner:query-code "How does authentication work?" --repo /path/to/repo
/code-learner:query-code "How does authentication work?" --repo https://github.com/user/repo
/code-learner:query-code "What modules depend on the database layer?"
/code-learner:query-code "Where is the HTTP routing configured?"
```

| Option | Description |
|--------|-------------|
| `--repo <path\|url>` | Path or git URL of the repository (optional if only one analysis exists in `.agent_workspace/`). Git URLs are cloned to `.agent_workspace/<repo-name>/_clone/`. |

If no analysis exists for the specified repo, `query-code` offers to run `learn-code` first.

### understand-pull-request

Analyzes a pull request or merge request. Fetches PR metadata, identifies affected modules, analyzes changes in context via fan-out agents, and produces a structured `PR-<number>-ANALYSIS.md` document with a brief repo overview and detailed change analysis. Supports both GitHub (`gh`) and GitLab (`glab`) CLIs.

```
/code-learner:understand-pull-request 42
/code-learner:understand-pull-request 42 --repo /path/to/repo
/code-learner:understand-pull-request https://github.com/org/repo/pull/42
/code-learner:understand-pull-request https://gitlab.com/org/repo/-/merge_requests/42
```

| Option | Description |
|--------|-------------|
| `--repo <path>` | Path to the local repository checkout (defaults to current directory) |

The pipeline runs four steps: **PR Metadata** (fetch via CLI), **Repo Context** (language detection + repo overview), **Change Analysis** (fan-out agents per affected module), and **Synthesis** (produce final document). If a prior `learn-code` analysis exists, the repo overview is reused from `ONBOARDING.md`. PR descriptions and commit messages are used as context but the code changes are treated as authoritative.

## Workflow Phases

The `learn-code` pipeline runs these five phases:

| Phase | What happens | Agent dispatch |
|-------|-------------|----------------|
| **Detection** | Detect primary language, walk file tree, read config files | None (scripts only) |
| **Module Registry** | Produce per-module registry with tailored analysis questions | 1 `repo-mapper` agent |
| **Module Analysis** | Deep analysis of each module's public API, data flow, dependencies, and gotchas. Modules are classified into tiers (full/api-guided/api-only) based on size and complexity | Batches of up to 10 `module-analyzer` agents in parallel. API-only modules generate summaries without agent dispatch |
| **Relationships** | Cross-module coupling analysis — coupling types, shared types, implicit contracts. Priority pairs (max 20) get agent analysis; remaining pairs get lightweight entries | Batches of up to 10 `relationship-analyzer` agents in parallel |
| **Synthesis** | Combine all results into a structured ONBOARDING.md guide. Context is budgeted to 80KB with progressive truncation | 1 `synthesis-writer` agent |

### understand-pull-request pipeline

| Phase | What happens | Agent dispatch |
|-------|-------------|----------------|
| **PR Metadata** | Fetch PR/MR data via `gh` or `glab` CLI (title, description, commits, changed files, diffs) | None (script only) |
| **Repo Context** | Detect language, build module map, produce repo overview (reuses learn-code ONBOARDING.md if available) | 0 or 1 `pr-repo-summarizer` agent |
| **Change Analysis** | Identify affected modules, analyze changes per module with diffs and source context | Batches of up to 10 `pr-change-analyzer` agents in parallel |
| **Synthesis** | Combine all results into PR-ANALYSIS.md with repo overview, per-module changes, cross-module impact, risks | 1 `pr-synthesis-writer` agent |

### AST extraction

Before dispatching module and relationship agents, the pipeline pre-extracts each module's public API surface using full AST parsing:

- **Python** — Python's `ast` module extracts functions, classes, methods, constants, and imports
- **Go** — tree-sitter parses exported functions, methods, structs, interfaces, variables, constants, and imports
- **JavaScript** — tree-sitter parses export statements (function, class, const, default, re-exports) and imports
- **TypeScript** — tree-sitter parses all JS exports plus interfaces, type aliases, enums, and abstract classes

This pre-extracted API surface is passed to agents alongside full source code, giving them a structured overview before they read the raw code.

## Output

All output goes to `.agent_workspace/<repo-name>/`:

| Directory | Contents |
|-----------|----------|
| `detection/` | `detection.json` — language, module map, config file contents |
| `module-registry/` | `registry.json` + `registry.md` — module purposes, complexity, analysis questions |
| `module-analysis/` | Per-module `.json` files + `summary.json` + `summary.md` |
| `relationships/` | `relationships.json` + `dependency-graph.json` + `relationships.md` |
| `synthesis/` | `ONBOARDING.md` — the final onboarding guide, `context.json` — budgeted synthesis context |
| `workflow/` | `learn-code_<repo>.json`, `understand-pr_<repo>_<number>.json` — progress tracking for resume |
| `pr-<number>/pr-metadata/` | `metadata.json` + `diff.patch` — PR metadata and diffs |
| `pr-<number>/repo-context/` | `detection.json` + `repo-overview.md` — language detection and repo overview |
| `pr-<number>/change-analysis/` | Per-module `.json` files + `affected-modules.json` + `change-summary.json` |
| `pr-<number>/synthesis/` | `PR-<number>-ANALYSIS.md` — the final PR analysis document |

## Agents

| Agent | Role | Used by |
|-------|------|---------|
| `repo-mapper` | Maps repo structure to module registry without reading source | Module Registry step |
| `module-analyzer` | Deep analysis of a single module (public API, data flow, gotchas) | Module Analysis step |
| `relationship-analyzer` | Analyzes coupling between two modules | Relationships step |
| `synthesis-writer` | Writes the final ONBOARDING.md from all analysis data | Synthesis step |
| `code-questioner` | Answers questions using analysis data + direct source inspection | query-code skill |
| `pr-repo-summarizer` | Produces a brief repo overview when no learn-code analysis exists | understand-pull-request skill |
| `pr-change-analyzer` | Analyzes changes a PR makes to a single module | understand-pull-request skill |
| `pr-synthesis-writer` | Writes the final PR-ANALYSIS.md from all PR analysis data | understand-pull-request skill |

## Supported Languages

| Language | AST method | Extracts |
|----------|-----------|----------|
| Python | `ast` module (stdlib) | Functions, classes, methods, constants, imports |
| Go | tree-sitter (`web-tree-sitter`) | Functions, methods, structs, interfaces, variables, constants, imports |
| JavaScript | tree-sitter (`web-tree-sitter`) | Exports (function, class, const, default, re-exports), imports, require() |
| TypeScript | tree-sitter (`web-tree-sitter`) | All JS exports + interfaces, type aliases, enums, abstract classes |

## Project Structure

```
code-learner/                        # Marketplace root
├── plugins/
│   └── code-learner/                # Plugin
│       ├── .claude-plugin/plugin.json
│       ├── skills/
│       │   ├── learn-code/          # Codebase analysis pipeline
│       │   │   ├── SKILL.md
│       │   │   └── scripts/         # Python + Node.js extraction/classification scripts
│       │   ├── query-code/          # Natural-language querying
│       │   │   └── SKILL.md
│       │   └── understand-pull-request/  # PR/MR analysis
│       │       ├── SKILL.md
│       │       └── scripts/         # Shell + Python PR analysis scripts
│       ├── agents/                  # Agent role definitions
│       ├── reference/               # Language configs + onboarding template
│       └── package.json             # tree-sitter dependencies
├── README.md
└── .gitignore
```
