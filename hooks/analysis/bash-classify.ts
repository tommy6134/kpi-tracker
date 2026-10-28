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
  /** Un comando semplice corrisponde a un comando di build o di test personalizzato (opzioni buildCommands, testCommands). */
  custom: boolean
}

/** I comandi di build e di test personalizzati, già divisi in parole minuscole (vedi `customOf`). */
export type CustomCommands = { build: readonly string[][]; test: readonly string[][] }

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
/** Fasi e goal Maven: di test, di compilazione e packaging, di gestione delle dipendenze; gli altri (clean, run, sonar…) non sono build. */
const MVN_TEST = ['test', 'verify', 'integration-test', 'surefire:test', 'failsafe:integration-test', 'failsafe:verify']
const MVN_BUILD = ['compile', 'test-compile', 'package', 'install', 'deploy', 'spring-boot:repackage', 'spring-boot:build-image', 'assembly:single', 'jar:jar', 'war:war', 'shade:shade', 'quarkus:build', 'native:compile']
const MVN_PACKAGE = ['dependency:tree', 'dependency:resolve', 'dependency:analyze', 'dependency:go-offline', 'dependency:copy-dependencies', 'versions:display-dependency-updates', 'versions:set', 'versions:use-latest-releases']
const MVN_PHASES = new Set([
  ...MVN_TEST, ...MVN_BUILD, ...MVN_PACKAGE,
  'clean', 'validate', 'site', 'spring-boot:run', 'exec:java', 'help:effective-pom', 'generate-sources', 'process-resources', 'quarkus:dev', 'jacoco:report',
  'spotless:apply', 'spotless:check', 'checkstyle:check', 'sonar:sonar', 'wrapper:wrapper',
])
/** Task Gradle (minuscoli, senza progetto): di test, di compilazione e packaging; gli altri (clean, bootRun, lint…) non sono build. */
const GRADLE_TEST = ['test', 'check', 'integrationtest', 'connectedcheck', 'connectedandroidtest', 'testdebugunittest', 'testreleaseunittest']
const GRADLE_BUILD = [
  'build', 'assemble', 'jar', 'bootjar', 'shadowjar', 'war', 'bootwar', 'compilejava', 'compilekotlin', 'compiletestjava', 'compiletestkotlin', 'installdist', 'distzip',
  'disttar', 'assembledebug', 'assemblerelease', 'bundledebug', 'bundlerelease', 'nativecompile', 'publish', 'publishtomavenlocal',
]
const GRADLE_TASKS = new Set([...GRADLE_TEST, ...GRADLE_BUILD, 'clean', 'bootrun', 'run', 'dependencies', 'lint', 'javadoc', 'spotlessapply', 'spotlesscheck', 'ktlintcheck', 'detekt', 'tasks', 'wrapper'])
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
const NG_SUBS = new Set(['build', 'test', 'e2e', 'serve', 'generate', 'g', 'lint', 'new', 'add', 'update', 'run', 'deploy', 'extract-i18n', 'version', 'config', 'analytics', 'cache', 'completion', 'doc'])
const NUXT_SUBS = new Set(['build', 'dev', 'generate', 'preview', 'prepare', 'typecheck', 'analyze', 'cleanup', 'init', 'info', 'upgrade', 'module'])
const MONO_SUBS = new Set(['run', 'build', 'test', 'lint', 'dev', 'prune', 'login', 'link', 'e2e', 'serve', 'run-many', 'affected', 'graph', 'generate', 'g', 'format', 'exec', 'bootstrap', 'publish', 'version', 'list', 'ls', 'changed', 'diff', 'init', 'add', 'clean', 'info'])
const BAZEL_SUBS = new Set(['build', 'test', 'run', 'query', 'clean', 'info', 'coverage', 'fetch', 'sync', 'mod'])
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
  ng: NG_SUBS,
  next: new Set(['build', 'dev', 'start', 'lint', 'export', 'info', 'telemetry']),
  nuxt: NUXT_SUBS,
  nuxi: NUXT_SUBS,
  astro: new Set(['build', 'dev', 'preview', 'check', 'sync', 'add', 'telemetry']),
  gatsby: new Set(['build', 'develop', 'serve', 'clean', 'new', 'info']),
  remix: new Set(['build', 'dev', 'routes']),
  'react-scripts': new Set(['start', 'build', 'test', 'eject']),
  'vue-cli-service': new Set(['serve', 'build', 'inspect', 'lint', 'test:unit', 'test:e2e']),
  vite: new Set(['build', 'dev', 'serve', 'preview', 'optimize']),
  webpack: new Set(['serve', 'watch', 'build', 'init', 'info', 'configtest']),
  parcel: new Set(['build', 'serve', 'watch']),
  turbo: MONO_SUBS,
  nx: MONO_SUBS,
  lerna: MONO_SUBS,
  sbt: new Set(['compile', 'test', 'testonly', 'package', 'assembly', 'run', 'clean', 'publish', 'publishlocal', 'console', 'reload', 'update']),
  bazel: BAZEL_SUBS,
  bazelisk: BAZEL_SUBS,
  buck2: BAZEL_SUBS,
  meson: new Set(['setup', 'compile', 'test', 'install', 'configure', 'dist', 'introspect']),
  xmake: new Set(['build', 'test', 'run', 'clean', 'config', 'install', 'package']),
  conan: new Set(['install', 'create', 'build', 'export', 'upload', 'new', 'profile']),
  cross: new Set(['build', 'test', 'run', 'check']),
  'wasm-pack': new Set(['build', 'test', 'pack', 'publish', 'new']),
  trunk: new Set(['build', 'serve', 'watch', 'clean']),
  goreleaser: new Set(['build', 'release', 'check', 'init']),
  ko: new Set(['build', 'apply', 'resolve', 'publish']),
  hatch: new Set(['build', 'test', 'run', 'env', 'shell', 'version', 'publish', 'new', 'fmt', 'clean']),
  pdm: new Set(['build', 'install', 'add', 'remove', 'update', 'lock', 'sync', 'run', 'publish', 'init', 'list', 'show']),
  flit: new Set(['build', 'publish', 'install', 'init']),
  maturin: new Set(['build', 'develop', 'publish', 'new', 'init']),
  composer: new Set(['install', 'update', 'require', 'remove', 'dump-autoload', 'run-script', 'run', 'test', 'validate', 'outdated', 'show', 'create-project', 'global']),
  rails: new Set(['test', 'server', 's', 'console', 'c', 'generate', 'g', 'db:migrate', 'routes', 'new', 'assets:precompile']),
  gem: new Set(['build', 'install', 'push', 'list', 'uninstall', 'update']),
  swift: new Set(['build', 'test', 'run', 'package']),
  flutter: new Set(['build', 'test', 'run', 'pub', 'analyze', 'clean', 'create', 'doctor', 'devices', 'drive', 'upgrade', 'format']),
  dart: new Set(['compile', 'test', 'run', 'pub', 'analyze', 'format', 'create', 'fix', 'doc']),
  pod: new Set(['install', 'update', 'repo', 'init', 'lib', 'spec', 'outdated']),
}

/** I programmi che lanciano script per nome (`npm run build`): lo script esce solo se ha un nome noto. */
const RUNNERS = new Set(['npm', 'pnpm', 'yarn', 'bun', 'turbo', 'lerna', 'composer'])
/** Per questi un nome di script può stare al posto del sottocomando (`yarn build`, `turbo test`). */
const SCRIPT_AS_SUB = new Set(['yarn', 'pnpm', 'bun', 'turbo'])
/** Programmi con un target o un task per nome, come make. */
const TARGETS = new Set(['make', 'gmake', 'just', 'task', 'gulp', 'grunt', 'rake'])
const XCODE_ACTIONS = new Set(['build', 'test', 'archive', 'clean', 'analyze', 'build-for-testing', 'test-without-building'])
const PY_MODULES = new Set(['pip', 'pytest', 'unittest', 'venv', 'http.server', 'build', 'tox', 'nox'])
const SETUP_CMDS = new Set(['build', 'sdist', 'bdist_wheel', 'build_ext', 'test', 'install', 'develop'])
const MANAGE_CMDS = new Set(['test', 'runserver', 'migrate', 'makemigrations', 'check', 'collectstatic', 'shell', 'createsuperuser'])
const ARTISAN_CMDS = new Set(['test', 'serve', 'migrate', 'tinker', 'optimize'])

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

/**
 * Come si classifica un programma: la categoria di default, e quella per
 * sottocomando (com'è nell'etichetta: `build`, `run test`, `-m build`,
 * `clean install`). `sub` calcola quella dei sottocomandi variabili (script,
 * target, fasi). `bySub`: fino alla 0.4.0 il sottocomando di questo programma
 * non si salvava o la categoria senza sottocomando era un'altra, quindi
 * un'etichetta col solo programma non basta a ricalcolarla.
 */
type Rule = { cat: BashCat; subs?: Readonly<Record<string, BashCat>>; sub?: (sub: string) => BashCat | undefined; bySub?: true }

/** La categoria di uno script dal nome: test o build; gli altri restano nella categoria del programma. */
function scriptCat(name: string): BashCat | undefined {
  if (/^(test|tests|e2e|unit|integration|coverage|cov)\b/.test(name)) {
    return 'test'
  }

  return /^(build|compile|bundle|typecheck|type-check|dist|package)\b/.test(name) ? 'build' : undefined
}

/** La categoria di un target (make, gulp, rake): come uno script, ma pulizia e attività di sviluppo non sono build. */
const taskCat = (name: string): BashCat | undefined => scriptCat(name) ?? (/^(clean|dev|start|serve|preview|watch|lint|format|fmt)\b/.test(name) ? 'altro' : undefined)

/** `run <script>` dei programmi che lanciano script. */
const runScript = (sub: string): BashCat | undefined => (sub.startsWith('run ') ? scriptCat(sub.slice(4)) : undefined)

/** La categoria da più fasi o task (`clean install`): test se ce n'è uno di test, build se ce n'è uno di build. */
const phases = (test: readonly string[], build: readonly string[], pkg: readonly string[] = []) => (sub: string): BashCat | undefined => {
  const words = sub.split(' ')

  return words.some(word => test.includes(word)) ? 'test' : words.some(word => build.includes(word)) ? 'build' : words.some(word => pkg.includes(word)) ? 'package' : undefined
}

/** Più programmi con la stessa regola. */
const same = (rule: Rule, names: readonly string[]): Record<string, Rule> => Object.fromEntries(names.map(name => [name, rule]))

const BUILD: Rule = { cat: 'build' }
const TEST: Rule = { cat: 'test' }
const PACKAGE: Rule = { cat: 'package' }
const SCRIPTS: Rule = { cat: 'package', subs: { test: 'test', t: 'test', build: 'build' }, sub: runScript }

/**
 * La classificazione, per linguaggio: aggiungere uno strumento è una riga.
 * Se ha sottocomandi da salvare, vanno anche in `SUBS`. Un programma che non
 * compare è `altro`.
 */
const RULES_BY_LANGUAGE: Readonly<Record<string, Record<string, Rule>>> = {
  git: same({ cat: 'git' }, ['git', 'gh', 'glab', 'tig', 'lazygit', 'git-lfs']),
  cobol: { cobc: BUILD },
  java: {
    mvn: { cat: 'altro', sub: phases(MVN_TEST, MVN_BUILD, MVN_PACKAGE), bySub: true },
    gradle: { cat: 'altro', sub: phases(GRADLE_TEST, GRADLE_BUILD, ['dependencies']), bySub: true },
    sbt: { cat: 'build', subs: { test: 'test', testonly: 'test', run: 'altro', console: 'altro', clean: 'altro', update: 'package' } },
    ...same(BUILD, ['ant', 'javac', 'kotlinc', 'scalac']),
  },
  js: {
    ...same(SCRIPTS, ['npm', 'pnpm', 'yarn', 'bun']),
    deno: { cat: 'package', subs: { test: 'test', bench: 'test', compile: 'build', check: 'build' } },
    node: { cat: 'altro', subs: { '--test': 'test' } },
    vite: { cat: 'altro', subs: { build: 'build' }, bySub: true },
    webpack: { cat: 'build', subs: { serve: 'altro', watch: 'altro' } },
    parcel: { cat: 'build', subs: { serve: 'altro', watch: 'altro' } },
    turbo: { cat: 'build', subs: { test: 'test', e2e: 'test', lint: 'altro', dev: 'altro', prune: 'altro', login: 'altro', link: 'altro' }, sub: runScript },
    nx: { cat: 'build', subs: { test: 'test', e2e: 'test', lint: 'altro', serve: 'altro', graph: 'altro', generate: 'altro', g: 'altro', format: 'altro' } },
    lerna: { cat: 'altro', subs: { publish: 'package', version: 'package', bootstrap: 'package' }, sub: runScript },
    ng: { cat: 'altro', subs: { build: 'build', test: 'test', e2e: 'test' } },
    next: { cat: 'altro', subs: { build: 'build' } },
    ...same({ cat: 'altro', subs: { build: 'build', generate: 'build', typecheck: 'build' } }, ['nuxt', 'nuxi']),
    astro: { cat: 'altro', subs: { build: 'build', check: 'build' } },
    ...same({ cat: 'altro', subs: { build: 'build' } }, ['gatsby', 'remix']),
    'react-scripts': { cat: 'altro', subs: { build: 'build', test: 'test' } },
    'vue-cli-service': { cat: 'altro', subs: { build: 'build', 'test:unit': 'test', 'test:e2e': 'test' } },
    ...same({ cat: 'build', sub: taskCat, bySub: true }, ['gulp', 'grunt']),
    ...same(BUILD, ['tsc', 'esbuild', 'rollup', 'tsup', 'swc', 'babel']),
    ...same(TEST, ['jest', 'vitest', 'mocha', 'karma', 'ava', 'tap', 'playwright', 'cypress']),
  },
  python: {
    python: {
      cat: 'altro',
      subs: {
        '-m unittest': 'test', '-m tox': 'test', '-m nox': 'test', '-m build': 'build', 'setup.py test': 'test', 'setup.py build': 'build', 'setup.py sdist': 'build',
        'setup.py bdist_wheel': 'build', 'setup.py build_ext': 'build', 'setup.py install': 'package', 'setup.py develop': 'package', 'manage.py test': 'test',
      },
    },
    ...same({ cat: 'package', subs: { build: 'build' } }, ['uv', 'poetry', 'pdm', 'flit']),
    hatch: { cat: 'package', subs: { build: 'build', test: 'test' } },
    maturin: { cat: 'build', subs: { develop: 'package', new: 'altro', init: 'altro' } },
    pyinstaller: BUILD,
    ...same(TEST, ['pytest', 'tox', 'nox', 'behave', 'robot']),
    ...same(PACKAGE, ['pip', 'pipx', 'pipenv', 'conda', 'mamba', 'pyenv']),
  },
  dotnet: {
    dotnet: { cat: 'package', subs: { build: 'build', publish: 'build', pack: 'build', msbuild: 'build', test: 'test' } },
    msbuild: BUILD,
    'vstest.console': TEST,
    nuget: PACKAGE,
  },
  go: {
    go: { cat: 'package', subs: { build: 'build', install: 'build', test: 'test', vet: 'altro' } },
    goreleaser: BUILD,
    ko: { cat: 'altro', subs: { build: 'build' } },
  },
  rust: {
    cargo: { cat: 'package', subs: { build: 'build', b: 'build', check: 'build', c: 'build', publish: 'build', test: 'test', t: 'test', nextest: 'test', bench: 'test', clippy: 'altro' } },
    ...same({ cat: 'altro', subs: { build: 'build', test: 'test', pack: 'build' } }, ['cross', 'wasm-pack']),
    trunk: { cat: 'altro', subs: { build: 'build' } },
    rustc: BUILD,
    nextest: TEST,
  },
  c: {
    ...same({ cat: 'build', sub: taskCat }, ['make', 'gmake', 'just', 'task']),
    ...same({ cat: 'build', subs: { test: 'test', coverage: 'test', run: 'altro', query: 'altro', clean: 'altro', info: 'altro' } }, ['bazel', 'bazelisk', 'buck2']),
    meson: { cat: 'build', subs: { test: 'test', introspect: 'altro' } },
    xmake: { cat: 'build', subs: { test: 'test', run: 'altro', clean: 'altro' } },
    conan: { cat: 'package', subs: { build: 'build', create: 'build' } },
    ...same(BUILD, ['cmake', 'ninja', 'scons', 'gcc', 'g++', 'clang', 'clang++', 'cc']),
    ctest: TEST,
  },
  php: {
    php: { cat: 'altro', subs: { 'artisan test': 'test' } },
    composer: { cat: 'package', subs: { test: 'test' }, sub: runScript },
    ...same(TEST, ['phpunit', 'pest']),
  },
  ruby: {
    rake: { cat: 'altro', sub: taskCat },
    rails: { cat: 'altro', subs: { test: 'test', 'assets:precompile': 'build' } },
    gem: { cat: 'package', subs: { build: 'build' } },
    rspec: TEST,
    ...same(PACKAGE, ['bundle', 'rbenv']),
  },
  mobile: {
    swift: { cat: 'altro', subs: { build: 'build', test: 'test', package: 'package' } },
    xcodebuild: { cat: 'build', subs: { test: 'test', 'test-without-building': 'test', clean: 'altro', analyze: 'altro' } },
    flutter: { cat: 'altro', subs: { build: 'build', test: 'test', drive: 'test', pub: 'package' } },
    dart: { cat: 'altro', subs: { compile: 'build', test: 'test', pub: 'package' } },
    swiftc: BUILD,
    pod: PACKAGE,
  },
  system: {
    ...same(PACKAGE, ['brew', 'apt', 'apt-get', 'yum', 'dnf', 'pacman', 'sdk', 'nvm', 'asdf', 'mise', 'npx']),
    ...same({ cat: 'docker' }, ['docker', 'docker-compose', 'kubectl', 'helm', 'minikube', 'kind', 'k9s', 'skaffold', 'terraform', 'ansible', 'vagrant']),
    ...same({ cat: 'fs' }, [
      'ls', 'cat', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'touch', 'find', 'grep', 'egrep', 'rg', 'ag', 'fd', 'head', 'tail', 'less', 'more', 'wc', 'chmod', 'chown', 'ln', 'sed',
      'awk', 'sort', 'uniq', 'cut', 'tr', 'tree', 'du', 'df', 'stat', 'file', 'diff', 'tar', 'zip', 'unzip', 'gzip', 'gunzip', 'echo', 'printf', 'pwd', 'realpath', 'readlink',
      'basename', 'dirname', 'xargs', 'jq', 'yq', 'tee', 'open', 'which', 'whereis', 'type', 'date', 'sleep', 'env', 'printenv', 'mktemp', 'column', 'od', 'xxd', 'md5',
      'shasum', 'sha256sum', 'base64', 'patch', 'comm', 'paste', 'split', 'nl', 'rev', 'bat', 'eza', 'exa', 'pbcopy', 'pbpaste',
    ]),
    ...same({ cat: 'network' }, ['curl', 'wget', 'ssh', 'scp', 'sftp', 'rsync', 'ping', 'nc', 'netcat', 'telnet', 'http', 'https', 'dig', 'nslookup', 'host', 'traceroute', 'nmap', 'openssl', 'aws', 'gcloud', 'az']),
  },
}

const RULES: Readonly<Record<string, Rule>> = Object.assign({}, ...Object.values(RULES_BY_LANGUAGE)) as Record<string, Rule>

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

/** L'indice della parola col programma, dopo assegnazioni d'ambiente, parole chiave e wrapper (`sudo -u x`, `timeout 30`). */
function programIndex(words: readonly { text: string; quoted?: boolean }[]): number {
  let index = 0

  while (index < words.length) {
    const word = words[index] as { text: string; quoted?: boolean }

    if (word.quoted !== true && /^[A-Za-z_][A-Za-z0-9_]*=/.test(word.text)) {
      index += 1
      continue
    }

    const base = baseOf(word.text)

    if (word.quoted !== true && KEYWORD_PREFIXES.has(word.text)) {
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

  return index
}

/** Il programma e il sottocomando di un comando semplice, o `null` se non c'è un programma utile. */
export function describeSimple(words: readonly { text: string; quoted: boolean }[]): { prog: string; sub?: string } | null {
  const index = programIndex(words)
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

  if (prog === 'bundle' && rest[0] === 'exec' && rest.length > 1) {
    return describeSimple(words.slice(index + 2)) ?? { prog, sub: 'exec' }
  }

  if (prog === 'python' || prog === 'py') {
    const m = rest.indexOf('-m')

    if (m !== -1 && rest[m + 1] !== undefined) {
      const module = (rest[m + 1] as string).toLowerCase()

      if (SAFE.test(module)) {
        const name = PY_MODULES.has(module) ? module : 'modulo'

        return name === 'pytest' ? { prog: 'pytest' } : { prog: 'python', sub: `-m ${name}` }
      }
    }

    // Gli script di convenzione di setuptools e Django: il loro comando dice se è build o test.
    const script = rest[0] === undefined ? '' : baseOf(rest[0]).toLowerCase()

    if (script === 'setup.py' || script === 'manage.py') {
      const command = (rest[1] ?? '').toLowerCase()
      const known = script === 'setup.py' ? SETUP_CMDS : MANAGE_CMDS

      return { prog: 'python', sub: `${script} ${known.has(command) ? command : '*'}` }
    }

    return { prog: 'python' }
  }

  if (prog === 'node' && rest.includes('--test')) {
    return { prog, sub: '--test' }
  }

  if (prog === 'php' && rest[0] === 'artisan') {
    const command = (rest[1] ?? '').toLowerCase()

    return { prog, sub: `artisan ${ARTISAN_CMDS.has(command) ? command : '*'}` }
  }

  // L'azione di xcodebuild può venire dopo le opzioni con valore (`-scheme App test`).
  if (prog === 'xcodebuild') {
    const action = rest.find(word => XCODE_ACTIONS.has(word.toLowerCase()))

    return action === undefined ? { prog } : { prog, sub: action.toLowerCase() }
  }

  if (prog === 'mvn') {
    const phases = rest.filter(word => MVN_PHASES.has(word))

    return phases.length > 0 ? { prog, sub: phases.join(' ') } : { prog }
  }

  if (prog === 'gradle') {
    const tasks = rest
      .filter(word => !word.startsWith('-'))
      .map(task => task.toLowerCase().split(':').pop() ?? '')
      .filter(task => GRADLE_TASKS.has(task))

    return tasks.length > 0 ? { prog, sub: [...new Set(tasks)].join(' ') } : { prog }
  }

  if (TARGETS.has(prog)) {
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
    const word = rest.find(one => !one.startsWith('-'))
    const sub = word?.toLowerCase()

    if (sub === undefined) {
      return { prog }
    }

    if (RUNNERS.has(prog) && (sub === 'run' || sub === 'run-script')) {
      const script = rest.slice(rest.indexOf(word as string) + 1).find(one => !one.startsWith('-'))

      return { prog, sub: script !== undefined && SCRIPT_NAMES.test(script) ? `run ${script.toLowerCase()}` : 'run *' }
    }

    // `yarn build`: per yarn, pnpm, bun e turbo uno script può stare al posto del sottocomando.
    if (SCRIPT_AS_SUB.has(prog) && !(known as Set<string>).has(sub) && SCRIPT_NAMES.test(sub)) {
      return { prog, sub: `run ${sub}` }
    }

    if (known instanceof Set) {
      return { prog, sub: known.has(sub) ? sub : '*' }
    }
  }

  return { prog }
}

/** La categoria di un comando descritto. */
export function categoryOf(prog: string, sub?: string): BashCat {
  const rule = RULES[prog]

  if (rule === undefined) {
    return 'altro'
  }

  return (sub === undefined ? undefined : (rule.subs?.[sub] ?? rule.sub?.(sub))) ?? rule.cat
}

/**
 * La categoria di un'etichetta salvata (`mvn clean install`), o `null` se non
 * basta a deciderla: il solo programma di uno strumento la cui categoria
 * dipende dal sottocomando, che fino alla 0.4.0 non si salvava.
 */
export function categoryOfLabel(label: string): BashCat | null {
  const space = label.indexOf(' ')
  const prog = space === -1 ? label : label.slice(0, space)
  const sub = space === -1 ? undefined : label.slice(space + 1)

  return sub === undefined && RULES[prog]?.bySub === true ? null : categoryOf(prog, sub)
}

/**
 * La categoria di una riga dalle etichette salvate, con le regole di adesso
 * (così valgono anche per gli eventi vecchi); `null` se le etichette non
 * bastano: nessuna, un'etichetta che non decide, o il limite di 8 raggiunto.
 */
export function categoryOfLabels(cmds: readonly string[]): BashCat | null {
  if (cmds.length === 0 || cmds.length >= 8) {
    return null
  }

  const cats = cmds.map(categoryOfLabel)

  return cats.includes(null) ? null : (PRIORITY.find(candidate => cats.includes(candidate)) ?? 'altro')
}

/** I comandi personalizzati dalle opzioni: elenchi separati da virgole (`build.sh, npm run package:all`). */
export function customOf(build: string, test: string): CustomCommands {
  const parse = (value: string): string[][] =>
    value
      .split(',')
      .map(entry => entry.trim().toLowerCase().split(/\s+/).filter(word => word !== ''))
      .filter(words => words.length > 0)
      .map(([first, ...rest]) => [baseOf(first as string), ...rest])

  return { build: parse(build), test: parse(test) }
}

/** La categoria personalizzata di un comando semplice, se le sue parole (dal programma in poi) iniziano con un comando delle opzioni. */
function customCat(words: readonly { text: string }[], custom: CustomCommands | undefined): BashCat | undefined {
  if (custom === undefined) {
    return undefined
  }

  const index = programIndex(words)
  const texts = words.slice(index).map((word, position) => (position === 0 ? baseOf(word.text) : word.text).toLowerCase())
  const matches = (entry: readonly string[]): boolean => entry.length <= texts.length && entry.every((word, position) => texts[position] === word)

  return custom.test.some(matches) ? 'test' : custom.build.some(matches) ? 'build' : undefined
}

/**
 * Descrive una riga di comando Bash. Senza comandi riconoscibili: `cmds`
 * vuoto, categoria `altro`. `custom` sono i comandi di build e test delle
 * opzioni: si confrontano in memoria e vincono sulla tabella.
 */
export function classifyBash(command: string, custom?: CustomCommands): BashInfo {
  let parsed: { words: { text: string; quoted: boolean }[][]; pipe: boolean }

  try {
    parsed = simpleCommands(tokenize(command)) as unknown as { words: { text: string; quoted: boolean }[][]; pipe: boolean }
  } catch {
    return { cmds: [], cat: 'altro', pipe: false, count: 0, custom: false }
  }

  const cmds: string[] = []
  const cats = new Set<BashCat>()
  let isCustom = false

  for (const words of parsed.words) {
    const own = customCat(words, custom)
    const described = describeSimple(words)

    if (own !== undefined) {
      cats.add(own)
      isCustom = true
    }

    if (described === null) {
      continue
    }

    const label = described.sub !== undefined ? `${described.prog} ${described.sub}` : described.prog

    if (own === undefined) {
      cats.add(categoryOf(described.prog, described.sub))
    }

    if (cmds.length < 8) {
      cmds.push(label)
    }
  }

  const cat = PRIORITY.find(candidate => cats.has(candidate)) ?? 'altro'

  return { cmds, cat, pipe: parsed.pipe, count: parsed.words.length, custom: isCustom }
}
