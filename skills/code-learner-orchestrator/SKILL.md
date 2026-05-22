---
name: code-learner-orchestrator
description: Documentation workflow orchestrator for codebase analysis. Reads the step list from YAML, runs steps sequentially, manages progress state. Claude is the orchestrator — the YAML is a step list, not a workflow engine.
argument-hint: <repo-path> [--workflow <name>] [--lang <language>] [--exclude <glob>...]
allowed-tools: Read, Write, Glob, Grep, Edit, Bash, Skill
---

# Code-Learner Orchestrator

Orchestrates the code-learner workflow: reads a YAML step list, executes each step sequentially by invoking the step's skill, tracks progress via a JSON file, and handles resume.

This skill is adapted from the docs-orchestrator pattern. Claude reads the YAML and drives the workflow — the YAML is a step list, not a workflow engine.

## Arguments

- `$1` — Path to the repository root (required)
- `--workflow <name>` — Workflow variant (default: `code-learner-workflow`; use `quick` for `code-learner-workflow-quick`)
- `--lang <language>` — Override language auto-detection
- `--exclude <glob>...` — Exclude patterns for module mapping

## Pre-flight

### 1. Parse arguments

Extract:
- `REPO_PATH` — first positional arg (required, must exist as a directory)
- `WORKFLOW` — from `--workflow` flag (default: `code-learner-workflow`)
- `LANG_OVERRIDE` — from `--lang` flag (optional)
- `EXCLUDE_PATTERNS` — from `--exclude` flag (optional, space-delimited)

Validate `REPO_PATH` exists and is a directory. Resolve to absolute path.

Derive `REPO_NAME` from the basename of `REPO_PATH` (e.g., `/home/user/my-project` → `my-project`).

### 2. Set base path

```bash
GIT_ROOT="$(cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" && pwd)"
BASE_PATH="${GIT_ROOT}/.agent_workspace/${REPO_NAME}"
mkdir -p "${BASE_PATH}"
```

### 3. Load workflow YAML

If `--workflow` is `quick`, load:
```
${CLAUDE_SKILL_DIR}/defaults/code-learner-workflow-quick.yaml
```

Otherwise load:
```
${CLAUDE_SKILL_DIR}/defaults/code-learner-workflow.yaml
```

Parse the YAML to extract:
- `workflow.name` — workflow type identifier
- `workflow.steps` — ordered list of step definitions

Each step has: `name`, `skill`, `description`, and optional `inputs` (list of upstream step names).

### 4. Check for existing progress (resume)

Look for an existing progress file:

```
${BASE_PATH}/workflow/${WORKFLOW_NAME}_${REPO_NAME}.json
```

**If found and status is `in_progress`**:
- Read the progress file
- Log: `"Resuming workflow from last checkpoint"`
- Skip steps whose status is `completed`
- Start from the first step whose status is `pending` or `in_progress`

**If found and status is `completed`**:
- Ask the user: `"Previous analysis found. Re-run from scratch?"`
- If yes: reset all steps to `pending`, update `updated_at`
- If no: show the completion summary and exit

**If not found**: create a new progress file (see below).

### 5. Create progress file

```json
{
  "workflow_type": "<workflow.name>",
  "target": "<REPO_NAME>",
  "repo_path": "<absolute REPO_PATH>",
  "base_path": "<absolute BASE_PATH>",
  "status": "in_progress",
  "created_at": "<current ISO 8601 UTC>",
  "updated_at": "<current ISO 8601 UTC>",
  "options": {
    "lang_override": "<LANG_OVERRIDE or null>",
    "exclude_patterns": ["<patterns>"]
  },
  "step_order": ["<step names in order>"],
  "steps": {
    "<step-name>": {
      "status": "pending",
      "output": null,
      "result": null
    }
  }
}
```

Write to `${BASE_PATH}/workflow/${WORKFLOW_NAME}_${REPO_NAME}.json`.

## Running Steps

For each step in `step_order` whose status is `pending`:

### 1. Validate input dependencies

If the step has `inputs`, verify each input step has status `completed` in the progress file. If not, STOP with an error.

### 2. Update progress to in_progress

Set `steps.<step-name>.status` to `in_progress` and update `updated_at`. Write progress file.

### 3. Build skill arguments

Construct the argument string for the step skill:

```
<REPO_PATH> --base-path <BASE_PATH> [--lang <LANG_OVERRIDE>] [--exclude <PATTERNS>...]
```

The `--lang` and `--exclude` flags are only passed to the `detection` step. Other steps inherit from detection output.

### 4. Invoke step skill

```
Skill: <step.skill>
args: <argument string>
```

### 5. Read step-result.json sidecar

After the skill completes, read the step-result sidecar:

```
${BASE_PATH}/<step-name>/step-result.json
```

If it exists, extract the result data. If it does not exist, log a warning and create a minimal result entry.

### 6. Update progress to completed

Set:
- `steps.<step-name>.status` to `completed`
- `steps.<step-name>.output` to `${BASE_PATH}/<step-name>/`
- `steps.<step-name>.result` to the data from step-result.json
- `updated_at` to current timestamp

Write progress file.

### 7. Log step completion

Log a step-specific message:

- **detection**: `"Detected <primary_language>, <module_count> modules"`
- **module-registry**: `"Registry built: <module_count> modules"`
- **module-analysis**: `"Analyzed <modules_analyzed> modules (<modules_failed> failures)"`
- **relationships**: `"Analyzed <pairs_analyzed> dependency pairs (tight: <N>, loose: <N>)"`
- **synthesis**: `"Onboarding guide written"`

### 8. Handle failures

If a step skill fails (throws an error or does not produce output):
- Set `steps.<step-name>.status` to `failed`
- Log the error
- Ask the user: `"Step <step-name> failed. Retry or skip?"`
- If retry: reset to `pending` and re-run
- If skip: mark as `failed` and continue (downstream steps with this as input will also fail)

## Completion

After all steps complete:

### 1. Update workflow status

Set `status` to `completed`. Update `updated_at`. Write progress file.

### 2. Print completion summary

```
Code-Learner Analysis Complete
================================
Repository: <REPO_NAME>
Language:   <primary_language>
Modules:    <module_count>
Relationships: <pairs_analyzed> (or "skipped" for quick mode)

Output files:
  Detection:    <BASE_PATH>/detection/
  Registry:     <BASE_PATH>/module-registry/
  Analysis:     <BASE_PATH>/module-analysis/
  Relationships: <BASE_PATH>/relationships/   (or "skipped")
  Onboarding:   <BASE_PATH>/synthesis/ONBOARDING.md

Workflow:     <BASE_PATH>/workflow/<progress-file>
```

### 3. Offer next steps

Suggest:
- Read the onboarding guide: `cat <BASE_PATH>/synthesis/ONBOARDING.md`
- View the dependency graph: `cat <BASE_PATH>/relationships/dependency-graph.json`
- Re-run with relationships: if quick mode was used, suggest full mode
