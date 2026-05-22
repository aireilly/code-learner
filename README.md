# code-learner

Multi-phase codebase analysis plugin for engineer onboarding. Analyzes repository structure, module boundaries, cross-module relationships, and produces structured onboarding guides.

## Usage

```
/code-learner:code-learner-start /path/to/repo
```

### Options

- `--workflow quick` — Skip relationship analysis for faster results
- `--lang <python|go|javascript|typescript>` — Override auto-detection
- `--exclude <glob>...` — Exclude patterns (e.g., `--exclude "vendor/*" "test/*"`)

## Workflow Phases

1. **Detection** — Detect primary language, walk file tree, read config files
2. **Module Registry** — Produce per-module registry with tailored analysis questions
3. **Module Analysis** — Fan-out one agent per module for deep analysis
4. **Relationships** — Fan-out one agent per dependency pair for coupling analysis
5. **Synthesis** — Combine all results into ONBOARDING.md

## Output

All output goes to `.agent_workspace/<repo-name>/`:

| Directory | Contents |
|-----------|----------|
| `detection/` | Language detection, module map |
| `module-registry/` | Per-module registry with analysis questions |
| `module-analysis/` | Per-module JSON analysis + combined summary |
| `relationships/` | Cross-module coupling analysis + dependency graph |
| `synthesis/` | Final ONBOARDING.md |
| `workflow/` | Progress tracking JSON |

## Supported Languages

- Python (AST-aware via `ast` module)
- Go (exported symbol detection via grep)
- JavaScript (export extraction via regex)
- TypeScript (export + type extraction via regex)
