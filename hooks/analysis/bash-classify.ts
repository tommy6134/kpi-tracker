/**
 * Classificazione dei comandi Bash: da una riga di shell ricava i comandi
 * semplici come `programma sottocomando` e una categoria.
 *
 * Privacy per costruzione: degli argomenti non esce nulla. Il programma è il
 * nome base dell'eseguibile; il sottocomando esce solo se appartiene a un
 * elenco noto per quel programma (`git commit`, `npm run build`), altrimenti
 * diventa `*`. I corpi heredoc, le stringhe tra virgolette, le sostituzioni
 * `$(…)` e le assegnazioni di variabili si scartano.
 */

import type { BashCat } from '../core/events'

export type BashInfo = {
  /** `programma` o `programma sottocomando`, al massimo 8, in ordine di apparizione. */
  cmds: string[]
  cat: BashCat
  /** Il comando contiene una pipe: l'esito riflette solo l'ultimo comando. */
  pipe: boolean
  /** Numero di comandi semplici. */
  count: number
}

const SAFE = /^[a-z0-9][a-z0-9._+-]{0,39}$/i

const WRAPPERS = new Set(['sudo', 'time', 'env', 'nohup', 'nice', 'command', 'exec', 'builtin', 'caffeinate', 'stdbuf', 'unbuffer', 'doas'])
const WRAPPERS_WITH_ARG = new Set(['timeout', 'gtimeout'])

const GIT_SUBS = new Set([
  'add', 'am', 'apply', 'archive', 'bisect', 'blame', 'branch', 'bundle', 'checkout', 'cherry', 'cherry-pick', 'clean', 'clone', 'commit',
  'config', 'describe', 'diff', 'difftool', 'fetch', 'format-patch', 'gc', 'grep', 'init', 'log', 'ls-files', 'ls-remote', 'ls-tree', 'merge',
  'merge-base', 'mv', 'notes', 'pull', 'push', 'range-diff', 'rebase', 'reflog', 'remote', 'reset', 'restore', 'rev-list', 'rev-parse', 'revert',
  'rm', 'shortlog', 'show', 'show-ref', 'sparse-checkout', 'stash', 'status', 'submodule', 'switch', 'tag', 'worktree', 'cat-file', 'check-ignore',
  'for-each-ref', 'name-rev', 'symbolic-ref', 'update-index', 'whatchanged', 'lfs', 'maintenance', 'hash-object', 'count-objects', 'fsck',
])
const GIT_OPTS_WITH_ARG = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path'])

const GH_SUBS = new Set(['pr', 'issue', 'repo', 'run', 'workflow', 'release', 'api', 'auth', 'gist', 'search', 'browse', 'label', 'secret', 'variable', 'cache', 'codespace', 'project', 'status', 'ruleset', 'attestation'])
const GLAB_SUBS = new Set(['mr', 'issue', 'repo', 'ci', 'pipeline', 'release', 'api', 'auth', 'label', 'variable', 'job', 'snippet'])
const NPM_SUBS = new Set(['install', 'i', 'ci', 'add', 'uninstall', 'remove', 'rm', 'update', 'up', 'outdated', 'audit', 'run', 'run-script', 'test', 't', 'start', 'build', 'exec', 'init', 'publish', 'pack', 'link', 'ls', 'list', 'version', 'view', 'info', 'dedupe', 'prune', 'rebuild', 'why', 'create', 'dlx', 'lint', 'format', 'dev', 'typecheck', 'config', 'cache', 'login', 'whoami', 'fund', 'doctor'])
const SCRIPT_NAMES = /^(build|test|tests|lint|dev|start|serve|preview|format|fmt|typecheck|type-check|check|e2e|coverage|cov|watch|compile|clean|deploy|release|bundle|storybook|generate|gen|prepare|ci|unit|integration|validate|verify|docs|bench|benchmark)([:._-](dev|prod|staging|local|ci|unit|e2e|watch|all|fix|check|debug|release|coverage|integration|api|web|app|client|server|ui|docker|js|ts|css|types|only|full|fast|quick|ios|android)){0,2}$/i
const MAKE_TARGETS = SCRIPT_NAMES
const DOCKER_SUBS = new Set(['build', 'run', 'exec', 'ps', 'images', 'image', 'pull', 'push', 'compose', 'logs', 'stop', 'start', 'rm', 'rmi', 'tag', 'login', 'inspect', 'network', 'volume', 'system', 'container', 'buildx', 'cp', 'kill', 'restart', 'up', 'down', 'stats', 'version', 'info', 'context', 'top', 'prune'])
const COMPOSE_SUBS = new Set(['up', 'down', 'build', 'ps', 'logs', 'exec', 'run', 'pull', 'push', 'restart', 'stop', 'start', 'config', 'rm', 'kill', 'top', 'images'])
const KUBECTL_SUBS = new Set(['get', 'describe', 'apply', 'delete', 'logs', 'exec', 'port-forward', 'rollout', 'scale', 'create', 'edit', 'config', 'top', 'cp', 'label', 'annotate', 'patch', 'run', 'expose', 'set', 'auth', 'cluster-info', 'version', 'explain', 'diff', 'wait'])
const HELM_SUBS = new Set(['install', 'upgrade', 'uninstall', 'list', 'template', 'repo', 'dependency', 'lint', 'package', 'rollback', 'status', 'history', 'show', 'pull', 'push', 'search', 'test', 'get'])
const MVN_PHASES = new Set(['clean', 'validate', 'compile', 'test-compile', 'test', 'package', 'verify', 'install', 'deploy', 'site', 'dependency:tree', 'dependency:resolve', 'dependency:analyze', 'versions:display-dependency-updates', 'spring-boot:run', 'exec:java', 'help:effective-pom', 'integration-test', 'generate-sources', 'process-resources', 'quarkus:dev', 'jacoco:report', 'spotless:apply', 'spotless:check', 'checkstyle:check', 'sonar:sonar', 'wrapper:wrapper'])
const GRADLE_TASKS = /^:?([a-z0-9-]+:)*(build|test|check|assemble|clean|bootrun|run|jar|bootjar|dependencies|lint|compilejava|compilekotlin|javadoc|publish|installdist|integrationtest|spotlessapply|spotlesscheck|tasks|wrapper|connectedcheck|testdebugunittest|assembledebug|assemblerelease)$/i
const CARGO_SUBS = new Set(['build', 'b', 'test', 't', 'run', 'r', 'check', 'c', 'clippy', 'fmt', 'add', 'remove', 'install', 'update', 'bench', 'doc', 'publish', 'new', 'init', 'clean', 'tree', 'nextest'])
const GO_SUBS = new Set(['build', 'test', 'run', 'get', 'mod', 'vet', 'fmt', 'install', 'generate', 'work', 'clean', 'list', 'env', 'version', 'tool'])
const PIP_SUBS = new Set(['install', 'uninstall', 'freeze', 'list', 'show', 'download', 'wheel', 'check', 'cache', 'config', 'index'])
const UV_SUBS = new Set(['run', 'add', 'remove', 'sync', 'lock', 'pip', 'venv', 'tool', 'python', 'init', 'build', 'publish', 'tree', 'export', 'version', 'cache', 'self'])
const POETRY_SUBS = new Set(['install', 'add', 'remove', 'update', 'lock', 'run', 'build', 'publish', 'shell', 'show', 'init', 'new', 'check', 'env', 'export', 'version'])
const DOTNET_SUBS = new Set(['build', 'test', 'run', 'restore', 'publish', 'add', 'new', 'clean', 'pack', 'watch', 'tool', 'format', 'ef', 'sln', 'list', 'nuget'])
const BREW_SUBS = new Set(['install', 'uninstall', 'upgrade', 'update', 'list', 'info', 'search', 'services', 'tap', 'cleanup', 'doctor', 'outdated', 'link', 'unlink', 'reinstall'])
const APT_SUBS = new Set(['install', 'remove', 'update', 'upgrade', 'purge', 'autoremove', 'search', 'show', 'list'])
const CLAUDE_SUBS = new Set(['plugin', 'plugins', 'mcp', 'config', 'update', 'doctor', 'agents', 'attach', 'logs', 'stop', 'install', 'migrate-installer', 'setup-token'])
const TERRAFORM_SUBS = new Set(['init', 'plan', 'apply', 'destroy', 'validate', 'fmt', 'output', 'state', 'import', 'workspace', 'refresh', 'providers', 'show', 'graph', 'taint', 'console'])
const SKIP_PROGS = new Set(['cd', 'pushd', 'popd', 'export', 'set', 'unset', 'source', '.', 'true', 'false', ':', 'test', '[', '[[', 'fi', 'done', 'esac', 'in', 'local', 'return', 'exit', 'trap', 'wait', 'read', 'shift', 'declare', 'typeset', 'alias', 'eval', '}', 'for', 'case', 'function', 'select'])
/** Parole chiave che precedono un comando (`do wc -l`, `if grep …`): si saltano e si guarda la parola dopo. */
const KEYWORD_PREFIXES = new Set(['do', 'then', 'else', 'elif', 'if', 'while', 'until', '!', '{'])

/** Sottocomandi conosciuti per programma; `true` = qualunque parola sicura (nomi di task/fasi validati altrove). */
const SUBS: Record<string, Set<string> | RegExp> = {
  git: GIT_SUBS,
  gh: GH_SUBS,
  glab: GLAB_SUBS,
  npm: NPM_SUBS,
  pnpm: NPM_SUBS,
  yarn: NPM_SUBS,
  bun: NPM_SUBS,
  docker: DOCKER_SUBS,
  podman: DOCKER_SUBS,
  'docker-compose': COMPOSE_SUBS,
  kubectl: KUBECTL_SUBS,
  helm: HELM_SUBS,
  cargo: CARGO_SUBS,
  go: GO_SUBS,
  pip: PIP_SUBS,
  pip3: PIP_SUBS,
  uv: UV_SUBS,
  poetry: POETRY_SUBS,
  dotnet: DOTNET_SUBS,
  brew: BREW_SUBS,
  apt: APT_SUBS,
  'apt-get': APT_SUBS,
  claude: CLAUDE_SUBS,
  terraform: TERRAFORM_SUBS,
  deno: new Set(['run', 'test', 'task', 'fmt', 'lint', 'compile', 'install', 'add', 'check', 'bench', 'serve']),
}

const ALIASES: Record<string, string> = {
  mvnw: 'mvn',
  gradlew: 'gradle',
  python3: 'python',
  'python3.11': 'python',
  'python3.12': 'python',
  'python3.13': 'python',
  pip3: 'pip',
  nodejs: 'node',
  podman: 'docker',
}

const CATEGORY: Record<string, BashCat> = {}

for (const name of ['git', 'gh', 'glab', 'tig', 'lazygit', 'git-lfs']) CATEGORY[name] = 'git'
for (const name of ['pytest', 'jest', 'vitest', 'mocha', 'rspec', 'phpunit', 'tox', 'nox', 'ctest', 'playwright', 'cypress', 'karma', 'ava', 'tap', 'nextest', 'behave', 'robot']) CATEGORY[name] = 'test'
for (const name of ['tsc', 'webpack', 'vite', 'esbuild', 'rollup', 'parcel', 'turbo', 'nx', 'cmake', 'ninja', 'bazel', 'javac', 'gcc', 'g++', 'clang', 'clang++', 'rustc', 'swiftc', 'kotlinc', 'scalac', 'sbt', 'ant', 'msbuild', 'xcodebuild', 'make', 'gmake', 'mvn', 'gradle']) CATEGORY[name] = 'build'
for (const name of ['npm', 'pnpm', 'yarn', 'bun', 'pip', 'uv', 'poetry', 'pipenv', 'conda', 'mamba', 'brew', 'apt', 'apt-get', 'yum', 'dnf', 'pacman', 'gem', 'bundle', 'composer', 'cargo', 'go', 'sdk', 'nvm', 'pyenv', 'rbenv', 'asdf', 'mise', 'npx', 'pipx', 'dotnet', 'deno']) CATEGORY[name] = 'package'
for (const name of ['docker', 'docker-compose', 'kubectl', 'helm', 'minikube', 'kind', 'k9s', 'skaffold', 'terraform', 'ansible', 'vagrant']) CATEGORY[name] = 'docker'
for (const name of ['ls', 'cat', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'touch', 'find', 'grep', 'egrep', 'rg', 'ag', 'fd', 'head', 'tail', 'less', 'more', 'wc', 'chmod', 'chown', 'ln', 'sed', 'awk', 'sort', 'uniq', 'cut', 'tr', 'tree', 'du', 'df', 'stat', 'file', 'diff', 'tar', 'zip', 'unzip', 'gzip', 'gunzip', 'echo', 'printf', 'pwd', 'realpath', 'readlink', 'basename', 'dirname', 'xargs', 'jq', 'yq', 'tee', 'open', 'which', 'whereis', 'type', 'date', 'sleep', 'env', 'printenv', 'mktemp', 'column', 'od', 'xxd', 'md5', 'shasum', 'sha256sum', 'base64', 'patch', 'comm', 'paste', 'split', 'nl', 'rev', 'bat', 'eza', 'exa', 'pbcopy', 'pbpaste']) CATEGORY[name] = 'fs'
for (const name of ['curl', 'wget', 'ssh', 'scp', 'sftp', 'rsync', 'ping', 'nc', 'netcat', 'telnet', 'http', 'https', 'dig', 'nslookup', 'host', 'traceroute', 'nmap', 'openssl', 'aws', 'gcloud', 'az']) CATEGORY[name] = 'network'

/** Priorità per la categoria di un comando composto. */
const PRIORITY: BashCat[] = ['test', 'build', 'git', 'package', 'docker', 'network', 'fs', 'altro']

type Token = { kind: 'word'; text: string; quoted: boolean } | { kind: 'op'; text: string }

/** Tokenizza una riga di shell: parole e operatori; scarta commenti, corpi heredoc e contenuto di `$(…)`/backtick. */
export function tokenize(command: string): Token[] {
  const tokens: Token[] = []
  const heredocs: string[] = []
  let index = 0
  let word = ''
  let quoted = false
  let hasWord = false

  const push = () => {
    if (hasWord) {
      tokens.push({ kind: 'word', text: word, quoted })
    }

    word = ''
    quoted = false
    hasWord = false
  }

  while (index < command.length) {
    const ch = command[index] as string
    const next = command[index + 1]

    if (ch === '\n') {
      push()
      tokens.push({ kind: 'op', text: ';' })
      index += 1

      // Salta i corpi heredoc in attesa: righe fino al delimitatore.
      while (heredocs.length > 0 && index < command.length) {
        const end = command.indexOf('\n', index)
        const line = command.slice(index, end === -1 ? command.length : end)

        index = end === -1 ? command.length : end + 1

        if (line.trim() === heredocs[0]) {
          heredocs.shift()
        }
      }

      continue
    }

    if (ch === '\\') {
      word += next ?? ''
      hasWord = true
      index += 2
      continue
    }

    if (ch === "'") {
      const end = command.indexOf("'", index + 1)

      word += end === -1 ? command.slice(index + 1) : command.slice(index + 1, end)
      quoted = true
      hasWord = true
      index = end === -1 ? command.length : end + 1
      continue
    }

    if (ch === '"') {
      let cursor = index + 1

      while (cursor < command.length && command[cursor] !== '"') {
        cursor += command[cursor] === '\\' ? 2 : 1
      }

      word += command.slice(index + 1, cursor)
      quoted = true
      hasWord = true
      index = cursor + 1
      continue
    }

    if (ch === '`' || (ch === '$' && next === '(')) {
      // Sostituzione di comando: contenuto opaco.
      let depth = 0
      let cursor = index

      if (ch === '`') {
        const end = command.indexOf('`', index + 1)

        cursor = end === -1 ? command.length : end + 1
      } else {
        for (; cursor < command.length; cursor += 1) {
          if (command[cursor] === '(') depth += 1
          if (command[cursor] === ')') {
            depth -= 1
            if (depth === 0) {
              cursor += 1
              break
            }
          }
        }
      }

      word += '$SUB'
      quoted = true
      hasWord = true
      index = cursor
      continue
    }

    if (ch === '#' && !hasWord) {
      const end = command.indexOf('\n', index)

      index = end === -1 ? command.length : end
      continue
    }

    if (ch === '<' && next === '<' && command[index + 2] !== '<') {
      push()

      let cursor = index + 2

      if (command[cursor] === '-') cursor += 1
      while (command[cursor] === ' ') cursor += 1

      const match = /^(['"]?)([A-Za-z0-9_.-]+)\1/.exec(command.slice(cursor))

      if (match !== null) {
        heredocs.push(match[2] ?? '')
        index = cursor + match[0].length
      } else {
        index = cursor
      }

      continue
    }

    if (ch === '&' && next === '&') {
      push()
      tokens.push({ kind: 'op', text: '&&' })
      index += 2
      continue
    }

    if (ch === '|' && next === '|') {
      push()
      tokens.push({ kind: 'op', text: '||' })
      index += 2
      continue
    }

    if (ch === '|' || ch === ';' || ch === '&' || ch === '(' || ch === ')') {
      push()

      // `2>&1`, `&>`: redirezioni, non separatori.
      if (ch === '&' && (next === '>' || command[index - 1] === '>')) {
        index += 1
        continue
      }

      tokens.push({ kind: 'op', text: ch === '&' ? '&' : ch })
      index += 1
      continue
    }

    if (ch === ' ' || ch === '\t' || ch === '\r') {
      push()
      index += 1
      continue
    }

    if (ch === '>' || ch === '<') {
      // Redirezione: salta l'operatore e il suo bersaglio.
      push()

      let cursor = index + 1

      while (command[cursor] === '>' || command[cursor] === '&' || command[cursor] === '|') cursor += 1
      while (command[cursor] === ' ') cursor += 1
      while (cursor < command.length && !/[\s;&|()]/.test(command[cursor] as string)) cursor += 1

      index = cursor
      continue
    }

    word += ch
    hasWord = true
    index += 1
  }

  push()

  return tokens
}

/** Divide i token in comandi semplici (liste di parole). */
function simpleCommands(tokens: Token[]): { words: { text: string; quoted: boolean }[]; pipe: boolean } {
  const commands: { text: string; quoted: boolean }[][] = []
  let current: { text: string; quoted: boolean }[] = []
  let pipe = false

  for (const token of tokens) {
    if (token.kind === 'op') {
      if (token.text === '|') {
        pipe = true
      }

      if (current.length > 0) {
        commands.push(current)
      }

      current = []
      continue
    }

    current.push({ text: token.text, quoted: token.quoted })
  }

  if (current.length > 0) {
    commands.push(current)
  }

  return { words: commands as never, pipe }
}

const baseOf = (word: string): string => {
  const index = Math.max(word.lastIndexOf('/'), word.lastIndexOf('\\'))

  return (index >= 0 ? word.slice(index + 1) : word).replace(/\.(exe|cmd|bat)$/i, '')
}

/** Il programma e il sottocomando di un comando semplice, o `null` se non c'è un programma utile. */
export function describeSimple(words: readonly { text: string; quoted: boolean }[]): { prog: string; sub?: string } | null {
  let index = 0

  // Assegnazioni d'ambiente e wrapper.
  while (index < words.length) {
    const word = words[index] as { text: string; quoted: boolean }

    if (!word.quoted && /^[A-Za-z_][A-Za-z0-9_]*=/.test(word.text)) {
      index += 1
      continue
    }

    const base = baseOf(word.text)

    if (!word.quoted && KEYWORD_PREFIXES.has(word.text)) {
      index += 1
      continue
    }

    if (WRAPPERS.has(base)) {
      index += 1

      // Opzioni del wrapper (`sudo -u x`, `env -i`, `nice -n 5`).
      while (index < words.length && (words[index] as { text: string }).text.startsWith('-')) {
        const option = (words[index] as { text: string }).text

        index += 1

        if ((option === '-u' || option === '-n' || option === '-g') && index < words.length) {
          index += 1
        }
      }

      continue
    }

    if (WRAPPERS_WITH_ARG.has(base)) {
      index += 1

      while (index < words.length && (words[index] as { text: string }).text.startsWith('-')) index += 1

      index += 1 // la durata
      continue
    }

    break
  }

  const first = words[index]

  if (first === undefined || first.quoted) {
    return null
  }

  let prog = baseOf(first.text)

  if (!SAFE.test(prog) || SKIP_PROGS.has(prog)) {
    return null
  }

  prog = ALIASES[prog] ?? prog.toLowerCase()

  const rest = words.slice(index + 1).map(word => word.text)

  // Esecutori che lanciano un altro programma: si descrive quello.
  if ((prog === 'npx' || prog === 'bunx' || prog === 'pnpx') && rest.length > 0) {
    const inner = rest.findIndex(word => !word.startsWith('-'))

    return inner === -1 ? { prog } : describeSimple(words.slice(index + 1 + inner))
  }

  if (prog === 'uv' && rest[0] === 'run') {
    const inner = rest.slice(1).findIndex(word => !word.startsWith('-'))

    if (inner !== -1) {
      return describeSimple(words.slice(index + 2 + inner)) ?? { prog: 'uv', sub: 'run' }
    }
  }

  if ((prog === 'poetry' || prog === 'pipenv') && rest[0] === 'run' && rest.length > 1) {
    return describeSimple(words.slice(index + 2)) ?? { prog, sub: 'run' }
  }

  if (prog === 'python' || prog === 'py') {
    const m = rest.indexOf('-m')

    if (m !== -1 && rest[m + 1] !== undefined) {
      const module = (rest[m + 1] as string).toLowerCase()

      if (SAFE.test(module)) {
        const name = module === 'pip' || module === 'pytest' || module === 'unittest' || module === 'venv' || module === 'http.server' ? module : 'modulo'

        return name === 'pytest' ? { prog: 'pytest' } : { prog: 'python', sub: `-m ${name}` }
      }
    }

    return { prog: 'python' }
  }

  if (prog === 'mvn') {
    const phases = rest.filter(word => MVN_PHASES.has(word))

    return phases.length > 0 ? { prog, sub: phases.join(' ') } : { prog }
  }

  if (prog === 'gradle') {
    const tasks = rest.filter(word => !word.startsWith('-') && GRADLE_TASKS.test(word)).map(task => task.toLowerCase().split(':').pop() ?? task)

    return tasks.length > 0 ? { prog, sub: [...new Set(tasks)].join(' ') } : { prog }
  }

  if (prog === 'make' || prog === 'gmake' || prog === 'just' || prog === 'task') {
    const target = rest.find(word => !word.startsWith('-') && !word.includes('='))

    return target === undefined ? { prog } : { prog, sub: MAKE_TARGETS.test(target) ? target.toLowerCase() : '*' }
  }

  if (prog === 'git') {
    let cursor = 0

    while (cursor < rest.length) {
      const word = rest[cursor] as string

      if (GIT_OPTS_WITH_ARG.has(word)) {
        cursor += 2
        continue
      }

      if (word.startsWith('-')) {
        cursor += 1
        continue
      }

      break
    }

    const sub = rest[cursor]

    return sub === undefined ? { prog } : { prog, sub: GIT_SUBS.has(sub) ? sub : '*' }
  }

  if (prog === 'docker' && (rest[0] === 'compose' || rest[0] === 'buildx')) {
    const verb = rest.slice(1).find(word => !word.startsWith('-'))

    return { prog, sub: verb !== undefined && COMPOSE_SUBS.has(verb) ? `${rest[0]} ${verb}` : (rest[0] as string) }
  }

  const known = SUBS[prog]

  if (known !== undefined) {
    const sub = rest.find(word => !word.startsWith('-'))

    if (sub === undefined) {
      return { prog }
    }

    if ((prog === 'npm' || prog === 'pnpm' || prog === 'yarn' || prog === 'bun') && (sub === 'run' || sub === 'run-script')) {
      const script = rest.slice(rest.indexOf(sub) + 1).find(word => !word.startsWith('-'))

      return { prog, sub: script !== undefined && SCRIPT_NAMES.test(script) ? `run ${script.toLowerCase()}` : 'run *' }
    }

    // `yarn build`: per yarn/pnpm/bun uno script può stare al posto del sottocomando.
    if ((prog === 'yarn' || prog === 'pnpm' || prog === 'bun') && !(known as Set<string>).has(sub) && SCRIPT_NAMES.test(sub)) {
      return { prog, sub: `run ${sub.toLowerCase()}` }
    }

    if (known instanceof Set) {
      return { prog, sub: known.has(sub) ? sub : '*' }
    }
  }

  return { prog }
}

/** La categoria di un comando descritto. */
export function categoryOf(prog: string, sub?: string): BashCat {
  const s = sub ?? ''

  if (prog === 'pytest' || prog === 'cargo' && /^(test|t|nextest|bench)$/.test(s) || prog === 'go' && s === 'test' || prog === 'dotnet' && s === 'test' || prog === 'deno' && s === 'test') {
    return 'test'
  }

  if ((prog === 'npm' || prog === 'pnpm' || prog === 'yarn' || prog === 'bun') && (/^(test|t)$/.test(s) || /^run (test|tests|e2e|unit|integration|coverage|cov)/.test(s))) {
    return 'test'
  }

  if ((prog === 'npm' || prog === 'pnpm' || prog === 'yarn' || prog === 'bun') && /^(run (build|compile|bundle|typecheck|type-check)|build)/.test(s)) {
    return 'build'
  }

  if (prog === 'mvn') {
    return /\b(test|verify|integration-test)\b/.test(s) ? 'test' : 'build'
  }

  if (prog === 'gradle') {
    return /\b(test|check|integrationtest|connectedcheck|testdebugunittest)\b/.test(s) ? 'test' : 'build'
  }

  if (prog === 'make' || prog === 'gmake' || prog === 'just' || prog === 'task') {
    return /^(test|tests|check|e2e|unit|integration|coverage|cov)/.test(s) ? 'test' : 'build'
  }

  if (prog === 'python' && s === '-m unittest') {
    return 'test'
  }

  if ((prog === 'cargo' || prog === 'go' || prog === 'dotnet' || prog === 'deno') && /^(build|b|check|c|clippy|vet|compile|publish)$/.test(s)) {
    return 'build'
  }

  if ((prog === 'docker' || prog === 'podman') && s === 'build') {
    return 'docker'
  }

  if (prog === 'claude' && s.startsWith('plugin')) {
    return 'altro'
  }

  return CATEGORY[prog] ?? 'altro'
}

/** Descrive una riga di comando Bash. Senza comandi riconoscibili: `cmds` vuoto, categoria `altro`. */
export function classifyBash(command: string): BashInfo {
  let parsed: { words: { text: string; quoted: boolean }[][]; pipe: boolean }

  try {
    parsed = simpleCommands(tokenize(command)) as unknown as { words: { text: string; quoted: boolean }[][]; pipe: boolean }
  } catch {
    return { cmds: [], cat: 'altro', pipe: false, count: 0 }
  }

  const cmds: string[] = []
  const cats = new Set<BashCat>()

  for (const words of parsed.words) {
    const described = describeSimple(words)

    if (described === null) {
      continue
    }

    const label = described.sub !== undefined ? `${described.prog} ${described.sub}` : described.prog

    cats.add(categoryOf(described.prog, described.sub))

    if (cmds.length < 8) {
      cmds.push(label)
    }
  }

  const cat = PRIORITY.find(candidate => cats.has(candidate)) ?? 'altro'

  return { cmds, cat, pipe: parsed.pipe, count: parsed.words.length }
}
