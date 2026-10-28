/** Righe aggiunte e rimosse, e classe di un file, dai risultati di Edit/Write. */

import type { FileClass } from '../core/events'
import { DOCUMENT_EXT } from '../collect/docs'
import { baseName, extOf } from '../core/paths'

type Hunk = { lines?: readonly unknown[] }

/** Righe `+`/`-` di una structuredPatch. */
export function countPatch(patch: unknown): { add: number; del: number } {
  let add = 0
  let del = 0

  if (!Array.isArray(patch)) {
    return { add, del }
  }

  for (const hunk of patch as Hunk[]) {
    for (const line of hunk?.lines ?? []) {
      if (typeof line !== 'string') {
        continue
      }

      if (line.startsWith('+') && !line.startsWith('+++')) {
        add += 1
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        del += 1
      }
    }
  }

  return { add, del }
}

/** Numero di righe di un testo (0 per vuoto; l'ultima riga senza a capo conta). */
export function lineCount(text: unknown): number {
  if (typeof text !== 'string' || text === '') {
    return 0
  }

  const breaks = text.split('\n').length - 1

  return text.endsWith('\n') ? breaks : breaks + 1
}

/**
 * Le righe cambiate di un risultato Edit/Write: `gitDiff` se c'è, altrimenti
 * la structuredPatch; per un file creato senza patch, le righe del contenuto.
 */
export function linesOfResult(result: unknown): { add: number; del: number; created: boolean } {
  const r = (typeof result === 'object' && result !== null ? result : {}) as {
    type?: unknown
    content?: unknown
    structuredPatch?: unknown
    gitDiff?: { additions?: unknown; deletions?: unknown } | null
  }
  const created = r.type === 'create'
  const git = r.gitDiff

  if (git !== undefined && git !== null && typeof git.additions === 'number' && typeof git.deletions === 'number') {
    return { add: git.additions, del: git.deletions, created }
  }

  const patch = countPatch(r.structuredPatch)

  if (patch.add + patch.del === 0 && created) {
    return { add: lineCount(r.content), del: 0, created }
  }

  return { ...patch, created }
}

const DOC_EXT = new Set(['md', 'mdx', 'markdown', 'rst', 'txt', 'adoc', 'asciidoc', 'org', 'tex', 'rtf', ...DOCUMENT_EXT])
const CONFIG_EXT = new Set(['json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'properties', 'xml', 'plist', 'env', 'lock', 'gradle', 'editorconfig', 'npmrc', 'nvmrc', 'tf', 'tfvars', 'hcl'])
const CONFIG_NAMES = new Set(['dockerfile', 'makefile', 'jenkinsfile', 'procfile', 'gemfile', 'rakefile', 'justfile', 'vagrantfile', '.gitignore', '.gitattributes', '.dockerignore', '.env', '.prettierrc', '.eslintrc', 'pom.xml', 'build.gradle', 'settings.gradle', 'package.json', 'tsconfig.json', 'cargo.toml', 'go.mod', 'go.sum', 'pyproject.toml', 'requirements.txt'])
const CODE_EXT = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts', 'py', 'pyi', 'java', 'kt', 'kts', 'scala', 'groovy', 'go', 'rs', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh',
  'cs', 'fs', 'vb', 'rb', 'php', 'swift', 'm', 'mm', 'dart', 'lua', 'pl', 'r', 'jl', 'ex', 'exs', 'erl', 'clj', 'hs', 'ml', 'elm', 'sql', 'sh', 'bash', 'zsh',
  'fish', 'ps1', 'bat', 'cmd', 'css', 'scss', 'sass', 'less', 'html', 'htm', 'vue', 'svelte', 'astro', 'graphql', 'gql', 'proto', 'sol', 'zig', 'nim',
  'rpg', 'abap', 'jsp', 'ejs', 'hbs', 'twig', 'ipynb',
])
/** Sorgenti e copybook COBOL. */
const COBOL_EXT = new Set(['cbl', 'cob', 'cpy', 'cobol'])
/** I file mainframe che non sono COBOL: JCL, PL/I, REXX, mappe BMS di CICS, Easytrieve, CLIST. */
const MAINFRAME_EXT = new Set(['jcl', 'pli', 'pl1', 'rexx', 'rex', 'bms', 'ezt', 'clist'])
const TEST_RE = /(^|[\\/])(tests?|__tests__|specs?|e2e|it)[\\/]|[._-](test|spec|tests|e2e)\.[a-z0-9]+$|Tests?\.(java|kt|scala|cs|groovy)$|_test\.(go|py|rb|exs?)$|(^|[\\/])test_[^\\/]+\.py$|IT\.java$/i

/** La classe di un file: test, cobol, mainframe, config, doc, src o altro. */
export function classOf(path: string): FileClass {
  const name = baseName(path).toLowerCase()
  const ext = extOf(path)

  if (TEST_RE.test(path)) {
    return 'test'
  }

  if (COBOL_EXT.has(ext)) {
    return 'cobol'
  }

  if (MAINFRAME_EXT.has(ext)) {
    return 'mainframe'
  }

  if (CONFIG_NAMES.has(name) || CONFIG_EXT.has(ext)) {
    return 'config'
  }

  if (DOC_EXT.has(ext) || /(^|[\\/])docs?[\\/]/i.test(path)) {
    return 'doc'
  }

  if (CODE_EXT.has(ext)) {
    return 'src'
  }

  return 'altro'
}
