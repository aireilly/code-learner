---
name: code-learner-start
description: Analyze a codebase for engineer onboarding. Produces a structured onboarding guide with architecture overview, module analysis, cross-module relationships, reading order, and gotchas.
argument-hint: <repo-path> [--workflow quick] [--lang <language>] [--exclude <glob>...]
allowed-tools: Read, Write, Glob, Grep, Edit, Bash, Skill
---

# Code-Learner — Codebase Analysis for Onboarding

Entry point for the code-learner plugin. Validates inputs and invokes the orchestrator.

## Usage

```
/code-learner:code-learner-start /path/to/repo
/code-learner:code-learner-start /path/to/repo --workflow quick
/code-learner:code-learner-start /path/to/repo --lang typescript --exclude "test/*" "vendor/*"
```

## Arguments

- `$1` — Path to the repository to analyze (required)
- `--workflow <name>` — Workflow variant: `code-learner-workflow` (default, full analysis) or `quick` (skip relationships)
- `--lang <language>` — Override language auto-detection (python, go, javascript, typescript)
- `--exclude <glob>...` — Glob patterns to exclude from analysis

## Execution

### 1. Parse and validate arguments

Extract the repo path from the first positional argument.

Validate:
- The path exists and is a directory
- The path is not empty (has files)

If the repo path is relative, resolve it to an absolute path.

If the path does not exist, STOP and report: `"Repository path not found: <path>"`.

### 2. Resolve workflow name

If `--workflow quick` is specified, set workflow to `code-learner-workflow-quick`.
Otherwise, set workflow to `code-learner-workflow`.

### 3. Show analysis plan

Log what will happen:

```
Code-Learner: Analyzing <repo-name>
  Repository: <absolute-path>
  Workflow:   <workflow-name> (<step-count> steps)
  Language:   <auto-detect or override>
  Excludes:   <patterns or "none">
```

### 4. Invoke orchestrator

Pass all arguments through to the orchestrator:

```
Skill: code-learner:code-learner-orchestrator
args: <repo-path> [--workflow <name>] [--lang <language>] [--exclude <patterns>...]
```

The orchestrator handles all workflow management from here.
