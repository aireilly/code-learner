# code-learner

Claude Code plugin marketplace for codebase analysis and onboarding. Analyzes repository structure, module boundaries, cross-module relationships, and produces structured onboarding guides.

## Installation

```bash
claude marketplace add aireilly/code-learner
claude plugin install code-learner@code-learner
```

Tree-sitter is used for AST-based code extraction (Go, JavaScript, TypeScript). Install dependencies:

```bash
cd plugins/code-learner
npm install
```

Python 3.10+ is required for the detection and module-mapping scripts (no pip dependencies).

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

## Workflow Phases

The `learn-code` pipeline runs these five phases:

| Phase | What happens | Agent dispatch |
|-------|-------------|----------------|
| **Detection** | Detect primary language, walk file tree, read config files | None (scripts only) |
| **Module Registry** | Produce per-module registry with tailored analysis questions | 1 `repo-mapper` agent |
| **Module Analysis** | Deep analysis of each module's public API, data flow, dependencies, and gotchas. Modules are classified into tiers (full/api-guided/api-only) based on size and complexity | Batches of up to 10 `module-analyzer` agents in parallel. API-only modules generate summaries without agent dispatch |
| **Relationships** | Cross-module coupling analysis — coupling types, shared types, implicit contracts. Priority pairs (max 20) get agent analysis; remaining pairs get lightweight entries | Batches of up to 10 `relationship-analyzer` agents in parallel |
| **Synthesis** | Combine all results into a structured ONBOARDING.md guide. Context is budgeted to 80KB with progressive truncation | 1 `synthesis-writer` agent |

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
| `workflow/` | `learn-code_<repo>.json` — progress tracking for resume |

## Agents

| Agent | Role | Used by |
|-------|------|---------|
| `repo-mapper` | Maps repo structure to module registry without reading source | Module Registry step |
| `module-analyzer` | Deep analysis of a single module (public API, data flow, gotchas) | Module Analysis step |
| `relationship-analyzer` | Analyzes coupling between two modules | Relationships step |
| `synthesis-writer` | Writes the final ONBOARDING.md from all analysis data | Synthesis step |
| `code-questioner` | Answers questions using analysis data + direct source inspection | query-code skill |

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
│       │   └── query-code/          # Natural-language querying
│       │       └── SKILL.md
│       ├── agents/                  # Agent role definitions
│       ├── reference/               # Language configs + onboarding template
│       └── package.json             # tree-sitter dependencies
├── README.md
└── .gitignore
```
