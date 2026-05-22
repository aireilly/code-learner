#!/usr/bin/env bash
# Extract public API surface from Go source files.
#
# Exported symbols in Go start with an uppercase letter.
# Uses grep to find exported func, type, var, and const declarations.
# Optionally uses `go doc` if available for richer output.
#
# Usage:
#   bash extract_public_api_go.sh --files file1.go file2.go [--module auth]

set -euo pipefail

FILES=()
MODULE="unknown"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --files)
            shift
            while [[ $# -gt 0 && ! "$1" =~ ^-- ]]; do
                FILES+=("$1")
                shift
            done
            ;;
        --module)
            MODULE="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

if [[ ${#FILES[@]} -eq 0 ]]; then
    echo '{"error": "No files provided", "module": "'"$MODULE"'", "language": "go", "exports": []}'
    exit 0
fi

EXPORTS="[]"
TEMP_FILE=$(mktemp)
trap 'rm -f "$TEMP_FILE"' EXIT

for file in "${FILES[@]}"; do
    if [[ ! -f "$file" ]]; then
        continue
    fi

    BASENAME=$(basename "$file")

    # Exported functions
    grep -n '^func [A-Z]' "$file" 2>/dev/null | while IFS=: read -r line_num content; do
        NAME=$(echo "$content" | sed -E 's/^func ([A-Z][a-zA-Z0-9_]*).*/\1/')
        SIG=$(echo "$content" | head -c 400)
        printf '{"name":"%s","kind":"function","file":"%s","line":%s,"signature":"%s","docstring":null}\n' \
            "$NAME" "$BASENAME" "$line_num" "$(echo "$SIG" | sed 's/"/\\"/g')" >> "$TEMP_FILE"
    done

    # Exported types
    grep -n '^type [A-Z]' "$file" 2>/dev/null | while IFS=: read -r line_num content; do
        NAME=$(echo "$content" | sed -E 's/^type ([A-Z][a-zA-Z0-9_]*).*/\1/')
        KIND="type"
        echo "$content" | grep -q 'interface' && KIND="interface"
        echo "$content" | grep -q 'struct' && KIND="struct"
        SIG=$(echo "$content" | head -c 400)
        printf '{"name":"%s","kind":"%s","file":"%s","line":%s,"signature":"%s","docstring":null}\n' \
            "$NAME" "$KIND" "$BASENAME" "$line_num" "$(echo "$SIG" | sed 's/"/\\"/g')" >> "$TEMP_FILE"
    done

    # Exported variables
    grep -n '^var [A-Z]' "$file" 2>/dev/null | while IFS=: read -r line_num content; do
        NAME=$(echo "$content" | sed -E 's/^var ([A-Z][a-zA-Z0-9_]*).*/\1/')
        printf '{"name":"%s","kind":"variable","file":"%s","line":%s,"signature":"%s","docstring":null}\n' \
            "$NAME" "$BASENAME" "$line_num" "$(echo "$content" | head -c 200 | sed 's/"/\\"/g')" >> "$TEMP_FILE"
    done

    # Exported constants
    grep -n '^const [A-Z]' "$file" 2>/dev/null | while IFS=: read -r line_num content; do
        NAME=$(echo "$content" | sed -E 's/^const ([A-Z][a-zA-Z0-9_]*).*/\1/')
        printf '{"name":"%s","kind":"constant","file":"%s","line":%s,"signature":"%s","docstring":null}\n' \
            "$NAME" "$BASENAME" "$line_num" "$(echo "$content" | head -c 200 | sed 's/"/\\"/g')" >> "$TEMP_FILE"
    done
done

# Build JSON array from temp file
if [[ -s "$TEMP_FILE" ]]; then
    EXPORTS=$(python3 -c "
import json, sys
exports = []
for line in sys.stdin:
    line = line.strip()
    if line:
        try:
            exports.append(json.loads(line))
        except json.JSONDecodeError:
            pass
print(json.dumps(exports))
" < "$TEMP_FILE")
fi

# Extract imports
IMPORTS="[]"
IMPORT_TEMP=$(mktemp)
trap 'rm -f "$TEMP_FILE" "$IMPORT_TEMP"' EXIT

for file in "${FILES[@]}"; do
    if [[ ! -f "$file" ]]; then
        continue
    fi
    BASENAME=$(basename "$file")
    grep -E '^\s+"[^"]+"\s*$' "$file" 2>/dev/null | while read -r line; do
        MOD=$(echo "$line" | sed -E 's/.*"([^"]+)".*/\1/')
        printf '{"module":"%s","file":"%s"}\n' "$MOD" "$BASENAME" >> "$IMPORT_TEMP"
    done
done

if [[ -s "$IMPORT_TEMP" ]]; then
    IMPORTS=$(python3 -c "
import json, sys
imports = []
for line in sys.stdin:
    line = line.strip()
    if line:
        try:
            imports.append(json.loads(line))
        except json.JSONDecodeError:
            pass
print(json.dumps(imports))
" < "$IMPORT_TEMP")
fi

cat <<EOF
{
  "module": "$MODULE",
  "language": "go",
  "exports": $EXPORTS,
  "imports": $IMPORTS,
  "export_count": $(echo "$EXPORTS" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
}
EOF
