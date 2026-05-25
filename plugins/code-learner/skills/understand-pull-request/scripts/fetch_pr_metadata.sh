#!/usr/bin/env bash
# Fetch pull request / merge request metadata from GitHub (gh) or GitLab (glab).
# Normalizes both platforms into a common JSON schema and outputs to stdout.
#
# Usage:
#   fetch_pr_metadata.sh --platform github --pr 42 --repo-path /path/to/repo --diff-output /tmp/diff.patch
#   fetch_pr_metadata.sh --platform gitlab --pr 42 --repo-path /path/to/repo --diff-output /tmp/diff.patch

set -euo pipefail

PLATFORM=""
PR_NUMBER=""
REPO_PATH=""
DIFF_OUTPUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform)  PLATFORM="$2"; shift 2 ;;
    --pr)        PR_NUMBER="$2"; shift 2 ;;
    --repo-path) REPO_PATH="$2"; shift 2 ;;
    --diff-output) DIFF_OUTPUT="$2"; shift 2 ;;
    *) echo "{\"error\": \"Unknown argument: $1\"}"; exit 1 ;;
  esac
done

if [[ -z "$PLATFORM" || -z "$PR_NUMBER" || -z "$REPO_PATH" ]]; then
  echo '{"error": "Required arguments: --platform <github|gitlab> --pr <number> --repo-path <path>"}'
  exit 1
fi

cd "$REPO_PATH" || { echo "{\"error\": \"Cannot cd to $REPO_PATH\"}"; exit 1; }

error_exit() {
  printf '{"error": "%s"}\n' "$1"
  exit 1
}

# --- GitHub ---
fetch_github() {
  if ! command -v gh &>/dev/null; then
    error_exit "gh CLI not found. Install from https://cli.github.com/"
  fi

  local pr_json
  pr_json=$(gh pr view "$PR_NUMBER" --json title,body,state,author,commits,files,labels,headRefName,baseRefName,url 2>&1) || {
    error_exit "gh pr view failed: $(echo "$pr_json" | head -1)"
  }

  # Fetch diff
  if [[ -n "$DIFF_OUTPUT" ]]; then
    gh pr diff "$PR_NUMBER" > "$DIFF_OUTPUT" 2>/dev/null || true
  fi

  # Transform gh JSON into our common schema using python3 (jq may not be installed)
  python3 -c "
import json, sys

data = json.loads(sys.stdin.read())

commits = []
for c in data.get('commits', []):
    sha = c.get('oid', c.get('sha', ''))
    msg = c.get('messageHeadline', c.get('message', ''))
    authors = c.get('authors', [])
    author = authors[0].get('login', authors[0].get('name', '')) if authors else ''
    commits.append({'sha': sha[:12], 'message': msg, 'author': author})

files = []
for f in data.get('files', []):
    path = f.get('path', '')
    adds = f.get('additions', 0)
    dels = f.get('deletions', 0)
    # gh does not provide a status field directly; infer from additions/deletions
    if adds > 0 and dels == 0:
        status = 'added'
    elif adds == 0 and dels > 0:
        status = 'deleted'
    else:
        status = 'modified'
    files.append({'path': path, 'additions': adds, 'deletions': dels, 'status': status})

author_obj = data.get('author', {})
author_name = author_obj.get('login', author_obj.get('name', ''))

result = {
    'platform': 'github',
    'pr_number': int('$PR_NUMBER'),
    'title': data.get('title', ''),
    'description': data.get('body', '') or '',
    'state': data.get('state', '').lower(),
    'author': author_name,
    'base_branch': data.get('baseRefName', ''),
    'head_branch': data.get('headRefName', ''),
    'labels': [l.get('name', '') for l in data.get('labels', [])],
    'commits': commits,
    'changed_files': files,
    'url': data.get('url', ''),
}

json.dump(result, sys.stdout, indent=2)
print()
" <<< "$pr_json"
}

# --- GitLab ---
fetch_gitlab() {
  if ! command -v glab &>/dev/null; then
    error_exit "glab CLI not found. Install from https://gitlab.com/gitlab-org/cli"
  fi

  local mr_json
  mr_json=$(glab mr view "$PR_NUMBER" --output json 2>&1) || {
    error_exit "glab mr view failed: $(echo "$mr_json" | head -1)"
  }

  # Fetch diff
  if [[ -n "$DIFF_OUTPUT" ]]; then
    glab mr diff "$PR_NUMBER" > "$DIFF_OUTPUT" 2>/dev/null || true
  fi

  # Fetch changes (file list) — glab api call
  local changes_json
  changes_json=$(glab api "projects/:id/merge_requests/$PR_NUMBER/changes" 2>/dev/null) || changes_json="{}"

  # Transform glab JSON into our common schema
  python3 -c "
import json, sys

args = sys.argv[1:]
mr_raw = args[0]
changes_raw = args[1]

data = json.loads(mr_raw)
changes_data = json.loads(changes_raw)

commits = []
# glab mr view --output json does not include commits; fetch separately if needed
# For now, use the description and title as primary context

files = []
for c in changes_data.get('changes', []):
    path = c.get('new_path', c.get('old_path', ''))
    new_file = c.get('new_file', False)
    deleted_file = c.get('deleted_file', False)
    renamed_file = c.get('renamed_file', False)
    if new_file:
        status = 'added'
    elif deleted_file:
        status = 'deleted'
    elif renamed_file:
        status = 'renamed'
    else:
        status = 'modified'
    diff_text = c.get('diff', '')
    adds = sum(1 for line in diff_text.split('\n') if line.startswith('+') and not line.startswith('+++'))
    dels = sum(1 for line in diff_text.split('\n') if line.startswith('-') and not line.startswith('---'))
    files.append({'path': path, 'additions': adds, 'deletions': dels, 'status': status})

author_obj = data.get('author', {})
author_name = author_obj.get('username', author_obj.get('name', ''))

state = data.get('state', '').lower()
if state == 'opened':
    state = 'open'

result = {
    'platform': 'gitlab',
    'pr_number': int('$PR_NUMBER'),
    'title': data.get('title', ''),
    'description': data.get('description', '') or '',
    'state': state,
    'author': author_name,
    'base_branch': data.get('target_branch', ''),
    'head_branch': data.get('source_branch', ''),
    'labels': data.get('labels', []),
    'commits': commits,
    'changed_files': files,
    'url': data.get('web_url', ''),
}

json.dump(result, sys.stdout, indent=2)
print()
" "$mr_json" "$changes_json"
}

case "$PLATFORM" in
  github) fetch_github ;;
  gitlab) fetch_gitlab ;;
  *) error_exit "Unsupported platform: $PLATFORM. Use 'github' or 'gitlab'." ;;
esac
