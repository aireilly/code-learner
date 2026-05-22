---
name: code-learner-detection
description: Detect primary language, walk file tree, read config files, and produce detection.json. First step in the code-learner workflow.
argument-hint: <repo-path> --base-path <path> [--lang <language>] [--exclude <glob>...]
allowed-tools: Read, Write, Bash, Glob, Grep
---

# Detection Step

Step skill for the code-learner pipeline. Follows the step skill contract: **parse args → run scripts → write output**.

Detects the primary programming language, walks the file tree to build a module map, and reads config files. All work is done by scripts — no agent dispatch.

## Arguments

- `$1` — Path to the repository root (required)
- `--base-path <path>` — Base output path (e.g., `.agent_workspace/my-repo`)
- `--lang <language>` — Override language auto-detection (python, go, javascript, typescript)
- `--exclude <glob>...` — Additional glob patterns to exclude from module mapping

## Output

```
<base-path>/detection/detection.json
<base-path>/detection/step-result.json
```

## Execution

### 1. Parse arguments

Extract the repo path, `--base-path`, optional `--lang`, and any `--exclude` patterns from the args string.

Set the output path:

```bash
OUTPUT_DIR="${BASE_PATH}/detection"
mkdir -p "$OUTPUT_DIR"
```

### 2. Detect language

Run the detection script:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/detect_language.py --repo <REPO_PATH> [--lang <LANG>]
```

Capture the JSON output. If it contains an `error` field, STOP and report the error.

Extract `primary_language` from the result.

### 3. Build module map

Run the module map script:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/build_module_map.py --repo <REPO_PATH> --lang <PRIMARY_LANGUAGE> [--exclude <PATTERNS>...]
```

Capture the JSON output. If it contains an `error` field, STOP and report the error.

### 4. Read config files

From the module map result, read each file listed in `config_files`. Read the actual file content from the repo (e.g., `<REPO_PATH>/pyproject.toml`). Truncate each config file to 5000 characters to keep context manageable.

### 5. Write detection.json

Combine all results into a single detection JSON:

```json
{
  "primary_language": "<from detect_language>",
  "language_counts": "<from detect_language>",
  "total_files": "<from detect_language>",
  "total_source_files": "<from detect_language>",
  "modules": "<from build_module_map>",
  "module_count": "<from build_module_map>",
  "config_files": "<list of config file names>",
  "config_contents": {
    "<filename>": "<truncated file content>"
  },
  "repo_root": "<absolute repo path>",
  "excluded_patterns": "<from build_module_map>"
}
```

Write this to `${OUTPUT_DIR}/detection.json`.

### 6. Write step-result.json

```json
{
  "schema_version": 1,
  "step": "detection",
  "target": "<repo-name>",
  "completed_at": "<current ISO 8601 UTC timestamp>",
  "primary_language": "<detected language>",
  "languages_detected": "<language_counts>",
  "module_count": "<number of modules>",
  "total_source_files": "<count>",
  "config_files_found": ["<list of config files>"]
}
```

Write this to `${OUTPUT_DIR}/step-result.json`.

### 7. Verify

Confirm both output files exist. Log: `"Detection complete: <primary_language>, <module_count> modules, <total_source_files> source files"`.
