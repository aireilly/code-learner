#!/usr/bin/env node
/**
 * Extract public API surface from JavaScript/TypeScript files using regex-based parsing.
 *
 * No npm dependencies required. Uses regex to match export statements and extract
 * declarations with surrounding context.
 *
 * Usage:
 *   node extract_public_api.mjs --files file1.ts file2.ts --lang typescript
 *   node extract_public_api.mjs --files file1.js --lang javascript --module auth
 */

import { readFileSync } from 'fs';
import { basename } from 'path';

const args = process.argv.slice(2);
let files = [];
let lang = 'javascript';
let moduleName = 'unknown';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--files') {
    i++;
    while (i < args.length && !args[i].startsWith('--')) {
      files.push(args[i]);
      i++;
    }
    i--;
  } else if (args[i] === '--lang') {
    lang = args[++i];
  } else if (args[i] === '--module') {
    moduleName = args[++i];
  }
}

const EXPORT_PATTERNS = [
  // Named function exports
  /^export\s+(?:async\s+)?function\s+(\w+)/,
  // Named class exports
  /^export\s+class\s+(\w+)/,
  // Named const/let/var exports
  /^export\s+(?:const|let|var)\s+(\w+)/,
  // Default exports
  /^export\s+default\s+(?:function|class)\s*(\w*)/,
  // TypeScript: interface exports
  /^export\s+interface\s+(\w+)/,
  // TypeScript: type alias exports
  /^export\s+type\s+(\w+)/,
  // TypeScript: enum exports
  /^export\s+enum\s+(\w+)/,
  // TypeScript: abstract class exports
  /^export\s+abstract\s+class\s+(\w+)/,
  // Re-exports (named)
  /^export\s+\{([^}]+)\}\s+from/,
];

function classifyExport(line) {
  if (/export\s+interface\b/.test(line)) return 'interface';
  if (/export\s+type\b/.test(line)) return 'type';
  if (/export\s+enum\b/.test(line)) return 'enum';
  if (/export\s+abstract\s+class\b/.test(line)) return 'abstract-class';
  if (/export\s+class\b/.test(line)) return 'class';
  if (/export\s+(?:async\s+)?function\b/.test(line)) return 'function';
  if (/export\s+(?:const|let|var)\b/.test(line)) return 'constant';
  if (/export\s+default\b/.test(line)) return 'default';
  if (/export\s+\{/.test(line)) return 're-export';
  return 'unknown';
}

function extractExports(filepath) {
  let source;
  try {
    source = readFileSync(filepath, 'utf8');
  } catch {
    return [];
  }

  const lines = source.split('\n');
  const exports = [];
  const fileName = basename(filepath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    for (const pattern of EXPORT_PATTERNS) {
      const match = line.match(pattern);
      if (!match) continue;

      const name = match[1]?.trim() || '(anonymous)';
      const kind = classifyExport(line);

      // Grab the declaration line plus up to 3 following lines for context
      const contextLines = lines.slice(i, Math.min(i + 4, lines.length));
      const signature = contextLines.join('\n').substring(0, 400);

      if (kind === 're-export') {
        // Parse individual names from re-export
        const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim());
        for (const n of names) {
          if (n) {
            exports.push({
              name: n,
              kind: 're-export',
              file: fileName,
              line: i + 1,
              signature: line.substring(0, 200),
              docstring: null,
            });
          }
        }
      } else {
        exports.push({
          name,
          kind,
          file: fileName,
          line: i + 1,
          signature,
          docstring: null,
        });
      }

      break;
    }
  }

  return exports;
}

function extractImports(filepath) {
  let source;
  try {
    source = readFileSync(filepath, 'utf8');
  } catch {
    return [];
  }

  const imports = [];
  const fileName = basename(filepath);
  const lines = source.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // import ... from '...'
    const fromMatch = trimmed.match(/^import\s+(?:type\s+)?(?:\{[^}]*\}|[\w*]+(?:\s*,\s*\{[^}]*\})?)\s+from\s+['"]([^'"]+)['"]/);
    if (fromMatch) {
      imports.push({ module: fromMatch[1], file: fileName });
      continue;
    }

    // require('...')
    const requireMatch = trimmed.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (requireMatch) {
      imports.push({ module: requireMatch[1], file: fileName });
    }
  }

  return imports;
}

// Main
const allExports = files.flatMap(extractExports);
const allImports = files.flatMap(extractImports);

const result = {
  module: moduleName,
  language: lang,
  exports: allExports,
  imports: allImports,
  export_count: allExports.length,
};

console.log(JSON.stringify(result, null, 2));
