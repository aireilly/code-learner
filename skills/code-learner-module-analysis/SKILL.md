---
name: code-learner-module-analysis
description: Fan-out one module-analyzer agent per module. Each receives full source and a targeted question. Collects results into per-module JSON files and a combined summary.
argument-hint: <repo-path> --base-path <path>
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
---

# Module Analysis Step

Step skill for the code-learner pipeline. Follows the step skill contract: **parse args → read upstream → run AST scripts → fan out agents → merge → write output**.

This is the primary fan-out step. It dispatches one `module-analyzer` agent per module, all in a single message for parallel execution.

## Arguments

- `$1` — Path to the repository root (required)
- `--base-path <path>` — Base output path (e.g., `.agent_workspace/my-repo`)

## Output

```
<base-path>/module-analysis/<module-name>.json    (one per module)
<base-path>/module-analysis/summary.json           (combined array)
<base-path>/module-analysis/summary.md             (human-readable)
<base-path>/module-analysis/step-result.json
```

## Execution

### 1. Parse arguments

Extract the repo path and `--base-path` from the args string.

Set paths:

```bash
REGISTRY_FILE="${BASE_PATH}/module-registry/registry.json"
DETECTION_FILE="${BASE_PATH}/detection/detection.json"
OUTPUT_DIR="${BASE_PATH}/module-analysis"
mkdir -p "$OUTPUT_DIR"
```

### 2. Read upstream data

Read `${REGISTRY_FILE}` (JSON array of module entries) and `${DETECTION_FILE}` (detection data with module file lists).

Extract:
- `primary_language` from detection data
- Module file lists from `detection.modules`
- Registry entries (module name, question, purpose)

### 3. Pre-extract public API (AST-aware)

For each module, run the appropriate AST extraction script based on language:

**Python:**
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/extract_public_api.py \
  --files <file1.py> <file2.py> ... \
  --lang python \
  --module <module-name>
```

**JavaScript/TypeScript:**
```bash
node ${CLAUDE_SKILL_DIR}/scripts/extract_public_api.mjs \
  --files <file1.ts> <file2.ts> ... \
  --lang <javascript|typescript> \
  --module <module-name>
```

**Go:**
```bash
bash ${CLAUDE_SKILL_DIR}/scripts/extract_public_api_go.sh \
  --files <file1.go> <file2.go> ... \
  --module <module-name>
```

Capture the JSON output for each module. If a script fails for a module, log a warning and continue without pre-extracted API data for that module.

### 4. Load source for each module

For each module, concatenate all source files with file headers:

```
### FILE: <relative-path>
<file contents>
```

Use absolute paths when reading files. Files are listed in `detection.modules.<module-name>.files`.

**Important**: Keep all import statements — they are the relationship signal consumed by the relationships step.

### 5. Fan out module-analyzer agents

Dispatch ALL `module-analyzer` agents in a **single message** for parallel execution. Each agent gets:

```
Agent:
  subagent_type: code-learner:module-analyzer
  description: "Analyze module: <module-name>"
  prompt: |
    Analyze the following <LANGUAGE> module for engineer onboarding.

    MODULE: <module-name>
    LANGUAGE: <primary_language>
    QUESTION: <question from registry>

    PUBLIC_API (pre-extracted via AST):
    <JSON output from extract_public_api script, or "Not available" if extraction failed>

    SOURCE:
    <concatenated source with ### FILE: headers>

    Write your JSON result to: <OUTPUT_DIR>/<module-name>.json
```

**Critical**: All Agent tool calls MUST be in a single message so they execute in parallel. Do NOT dispatch agents one at a time.

### 6. Collect and merge results

After all agents complete, read each `<OUTPUT_DIR>/<module-name>.json` file.

For modules where the agent failed or produced invalid JSON, create a fallback entry:

```json
{
  "module": "<module-name>",
  "language": "<primary_language>",
  "purpose": "Analysis failed — manual review needed",
  "public_api": [],
  "dependencies": [],
  "external_libs": [],
  "data_flow": "Unknown",
  "implicit_contracts": [],
  "gotchas": ["Automated analysis failed for this module"],
  "onboarding_priority": "read-second",
  "question_answer": "Analysis failed"
}
```

### 7. Write summary.json

Combine all module results (successful and fallback) into a single JSON array. Write to `${OUTPUT_DIR}/summary.json`.

### 8. Write summary.md

Generate a human-readable summary:

```markdown
# Module Analysis Summary — <repo-name>

## Overview

- **Language**: <primary_language>
- **Modules analyzed**: <count>
- **Failed**: <count>

## Modules

### <module-name>

**Purpose**: <purpose>
**Priority**: <onboarding_priority>
**Public API**: <comma-separated list>
**Dependencies**: <comma-separated list>
**Key gotcha**: <first gotcha or "None">

---
```

Write to `${OUTPUT_DIR}/summary.md`.

### 9. Write step-result.json

```json
{
  "schema_version": 1,
  "step": "module-analysis",
  "target": "<repo-name>",
  "completed_at": "<current ISO 8601 UTC timestamp>",
  "modules_analyzed": "<successful count>",
  "modules_failed": "<failed count>",
  "total_public_api_entries": "<sum of public_api array lengths>",
  "languages": ["<primary_language>"]
}
```

Write to `${OUTPUT_DIR}/step-result.json`.

### 10. Verify

Confirm `summary.json`, `summary.md`, and `step-result.json` exist. Log: `"Module analysis complete: <analyzed> modules (<failed> failures)"`.
