import { describe, expect, test } from 'claude-code/testing'

import { classifyBash } from '../hooks/analysis/bash-classify'
import { classOf, countPatch, lineCount, linesOfResult } from '../hooks/analysis/lines'
import { mergeAll, mergeSummary } from '../hooks/analysis/merge'
import { foldEvents } from '../hooks/analysis/reducer'
import { addStat, emptyStat, percentileOf } from '../hooks/analysis/stats'
import { emptyDetails, emptySummary, REDUCER_VERSION } from '../hooks/analysis/summary-types'
import { dayOfArg, daysOfAge, monthOfArg, parseArgs, words } from '../hooks/commands/args'
import type { KpiSessionFile } from '../hooks/core/session-file'
import { decodeEvents, encodeEvent, type KpiEvent, type KpiEventBody } from '../hooks/core/events'
import { configDirOf, dirName, encodeProject, encodeProjectAlt, extOf, fileUrlOf, hasHiddenSegment, isInside, join, kpiRootOf, parseSessionDir, resolvePath, sessionDirName } from '../hooks/core/paths'
import { dayKey, hourSlot, monthEnd, stampOf } from '../hooks/core/time'
import { csvParts, exportFileName, nameSlugOf, partPathOf, periodOf } from '../hooks/export/export'
import { compact, dur, fixed, usd } from '../hooks/format/fmt'
import { i18nOf, langOf } from '../hooks/i18n'
import { embedJson, escapeHtml } from '../hooks/report/html'
import { categoriesOf, categoryOf, parseRules } from '../hooks/query/category'
import { describeFilter, filterOf, matchesProject } from '../hooks/query/filters'
import { compareDocs, DOCUMENT_EXT, parseDiff, parseStatus } from '../hooks/collect/docs'
import { hostOf as urlHost, statusOf } from '../hooks/collect/tool-extract'
import { kindOf } from '../hooks/tracker'
import { toneOf, worstOf } from '../hooks/ui/palette'

const T0 = Date.UTC(2026, 9, 12, 8, 0, 0)

describe('percorsi', () => {
  test('codifica il progetto come Claude Code', () => {
    expect(encodeProject('/Users/first.last/work/kpi_skill')).toBe('-Users-first-last-work-kpi-skill')
    expect(encodeProject('/x/docs folder/_work')).toBe('-x-docs-folder--work')
    expect(encodeProject('C:\\Users\\me\\repo')).toBe('C--Users-me-repo')
  })

  test('accorcia oltre 200 caratteri con un hash, e le collisioni hanno una variante', () => {
    const long = `/${'a'.repeat(250)}`
    const encoded = encodeProject(long)

    expect(encoded.length).toBeGreaterThan(200)
    expect(encoded.slice(0, 200)).toBe(`-${'a'.repeat(199)}`)
    expect(encodeProject('/a/b-c')).toBe(encodeProject('/a/b/c'))
    expect(encodeProjectAlt('/a/b-c')).not.toBe(encodeProjectAlt('/a/b/c'))
  })

  test('cartella di configurazione e radice dati', () => {
    expect(configDirOf({ CLAUDE_CONFIG_DIR: '/h/.claude-custom/' })).toBe('/h/.claude-custom')
    expect(configDirOf({ HOME: '/h' })).toBe('/h/.claude')
    expect(configDirOf({ USERPROFILE: 'C:\\Users\\me' })).toBe('C:\\Users\\me\\.claude')
    expect(kpiRootOf({ HOME: '/h' }, '')).toBe('/h/.claude/kpi')
    expect(kpiRootOf({ HOME: '/h' }, '~/dati')).toBe('/h/dati')
    expect(kpiRootOf({ HOME: '/h' }, 'relativo')).toBe(null)
    expect(kpiRootOf({ HOME: '/h' }, '~altro/dati')).toBe(null)
  })

  test('percorsi scritti dall\'utente e cartelle nascoste', () => {
    expect(resolvePath({ HOME: '/h' }, '~')).toBe('/h')
    expect(resolvePath({ HOME: '/h' }, ' ~/x/k.csv ')).toBe('/h/x/k.csv')
    expect(resolvePath({ USERPROFILE: 'C:\\Users\\me' }, '~\\x')).toBe('C:\\Users\\me\\x')
    expect(resolvePath({}, '~/x')).toBe(null)
    expect(resolvePath({ HOME: '/h' }, 'D:\\dati\\kpi\\')).toBe('D:\\dati\\kpi')
    expect(resolvePath({ HOME: '/h' }, 'x/k.csv')).toBe(null)
    expect(hasHiddenSegment('/home/me/.claude/kpi/_reports/latest.html')).toBe(true)
    expect(hasHiddenSegment('C:\\Users\\me\\.claude\\kpi')).toBe(true)
    expect(hasHiddenSegment('/home/me/Documenti/kpi/../x.html')).toBe(false)
    expect(hasHiddenSegment('/home/me/Scaricati/kpi-report.html')).toBe(false)
  })

  test('nome della cartella di sessione, ida e ritorno', () => {
    const name = sessionDirName(T0, '3f9a1c2e-aaaa', 120)

    expect(name).toBe('2026-10-12_10-00-00_3f9a1c2e')
    expect(parseSessionDir(name)).toEqual({ date: '2026-10-12', id8: '3f9a1c2e' })
    expect(parseSessionDir('project.json')).toBe(null)
  })

  test('utility', () => {
    expect(join('/a/', '/b', 'c')).toBe('/a/b/c')
    expect(extOf('/x/Main.Java')).toBe('java')
    expect(extOf('/x/.gitignore')).toBe('')
    expect(isInside('/a/b/c.ts', '/a/b')).toBe(true)
    expect(isInside('/a/bc/d', '/a/b')).toBe(false)
  })
})

describe('cartelle e URL', () => {
  test('cartella che contiene un file, anche su Windows', () => {
    expect(dirName('/a/b/c.csv')).toBe('/a/b')
    expect(dirName('/c.csv')).toBe('/')
    expect(dirName('C:\\x\\y.csv')).toBe('C:\\x')
    expect(dirName('C:\\y.csv')).toBe('C:\\')
  })

  test('URL file:// per il link del report', () => {
    expect(fileUrlOf('/home/me/.claude/kpi/_reports')).toBe('file:///home/me/.claude/kpi/_reports')
    expect(fileUrlOf('/a b/c#d')).toBe('file:///a%20b/c%23d')
    expect(fileUrlOf('C:\\Users\\me\\kpi')).toBe('file:///C:/Users/me/kpi')
    expect(fileUrlOf('\\\\server\\share\\kpi')).toBe('file://server/share/kpi')
  })
})

describe('tempo', () => {
  test('giorni e ore locali con fuso fisso', () => {
    expect(dayKey(Date.UTC(2026, 9, 12, 23, 30), 120)).toBe('2026-10-13')
    expect(stampOf(T0, 0)).toBe('2026-10-12_08-00-00')
    // 12/10/2026 è un lunedì: lunedì 08 → slot 8.
    expect(hourSlot(T0, 0)).toBe(8)
  })

  test('mesi: --mese in due forme, ultimo giorno del mese', () => {
    expect(monthOfArg('2026-11')).toBe('2026-11')
    expect(monthOfArg('3/2027')).toBe('2027-03')
    expect(monthOfArg('2026-13')).toBe(null)
    expect(monthOfArg('novembre')).toBe(null)
    expect(monthEnd('2026-11')).toBe('2026-11-30')
    expect(monthEnd('2026-02')).toBe('2026-02-28')
    expect(monthEnd('2028-02')).toBe('2028-02-29')
  })
})

describe('nome dei file di export', () => {
  test('nome normalizzato, periodo del filtro o data e ora, livello e parti', () => {
    expect(nameSlugOf('Thomas Amerio')).toBe('thomas_amerio')
    expect(nameSlugOf("  Zoë D'Àlvarez-Strauß ")).toBe('zoe_d_alvarez_strauss')
    expect(nameSlugOf('李')).toBe('')
    expect(periodOf({}, T0, 0)).toBe('2026-10-12_08-00-00')
    expect(periodOf({ sinceDay: '2026-10-01' }, T0, 0)).toBe('2026-10-12_08-00-00')
    expect(periodOf({ sinceDay: '2026-10-12', untilDay: '2026-10-12' }, T0)).toBe('2026-10-12')
    expect(periodOf({ sinceDay: '2026-02-01', untilDay: '2026-02-28' }, T0)).toBe('2026-02')
    expect(periodOf({ sinceDay: '2026-09-01', untilDay: '2026-11-30' }, T0)).toBe('2026-09_2026-11')
    expect(periodOf({ sinceDay: '2026-09-01', untilDay: '2026-11-29' }, T0)).toBe('2026-09-01_2026-11-29')
    expect(exportFileName('mario_rossi', '2026-11', null, 'csv')).toBe('kpi_mario_rossi_2026-11.csv')
    expect(exportFileName('', '2026-11', 'days', 'json')).toBe('kpi_2026-11_days.json')
    expect(partPathOf('/x/kpi_mario_rossi_2026-11.csv', 'parte', 2)).toBe('/x/kpi_mario_rossi_2026-11_parte2.csv')
    expect(partPathOf('/x/export', 'part', 3)).toBe('/x/export_part3')
  })
})

describe('classificazione Bash', () => {
  const cases: [string, string[], string][] = [
    ['git status', ['git status'], 'git'],
    ['git -C /repo commit -m "fix: segreto"', ['git commit'], 'git'],
    ['git push origin feature/x', ['git push'], 'git'],
    ['gh pr create --title "x"', ['gh pr'], 'git'],
    ['npm test', ['npm test'], 'test'],
    ['npm run build', ['npm run build'], 'build'],
    ['npm run deploy-SEGRETO', ['npm run *'], 'package'],
    ['yarn build', ['yarn build'], 'build'],
    ['yarn lint', ['yarn lint'], 'package'],
    ['yarn storybook', ['yarn run storybook'], 'package'],
    ['if grep -q x f; then echo ok; fi', ['grep', 'echo'], 'fs'],
    ['pnpm install', ['pnpm install'], 'package'],
    ['npx jest --watch', ['jest'], 'test'],
    ['npx vitest run', ['vitest'], 'test'],
    ['uv run pytest -q tests/', ['pytest'], 'test'],
    ['python -m pytest', ['pytest'], 'test'],
    ['python3 script.py --token abc', ['python'], 'altro'],
    ['python -m pip install requests', ['python -m pip'], 'altro'],
    ['./mvnw -q -pl core clean install', ['mvn clean install'], 'build'],
    ['mvn verify', ['mvn verify'], 'test'],
    ['mvn test -Dtest=FooTest', ['mvn test'], 'test'],
    ['./gradlew :app:test', ['gradle test'], 'test'],
    ['gradle build', ['gradle build'], 'build'],
    ['make test', ['make test'], 'test'],
    ['make all', ['make *'], 'build'],
    ['cargo test', ['cargo test'], 'test'],
    ['cargo build --release', ['cargo build'], 'build'],
    ['go test ./...', ['go test'], 'test'],
    ['go build ./cmd/x', ['go build'], 'build'],
    ['docker build -t img .', ['docker build'], 'docker'],
    ['docker compose up -d', ['docker compose up'], 'docker'],
    ['kubectl get pods -n prod', ['kubectl get'], 'docker'],
    ['curl -H "Authorization: Bearer SEGRETO" https://api.example.com/x?tok=SEGRETO', ['curl'], 'network'],
    ['ls -la && cat README.md', ['ls', 'cat'], 'fs'],
    ['cd sub && mvn test', ['mvn test'], 'test'],
    ['FOO=bar BAZ=SEGRETO npm test', ['npm test'], 'test'],
    ['sudo -u root apt-get install x', ['apt-get install'], 'package'],
    ['timeout 30 pytest', ['pytest'], 'test'],
    ['time npm run test:unit', ['npm run test:unit'], 'test'],
    ['echo "SEGRETO" | grep x', ['echo', 'grep'], 'fs'],
    ['cat <<EOF > f.txt\nSEGRETO riga\nEOF\ngit add f.txt', ['cat', 'git add'], 'git'],
    ['for f in *.ts; do wc -l $f; done', ['wc'], 'fs'],
    ['git log --oneline | head -5', ['git log', 'head'], 'git'],
    ['brew install jq', ['brew install'], 'package'],
    ['pip install -r requirements.txt', ['pip install'], 'package'],
    ['node dist/cli.js', ['node'], 'altro'],
    ['bash ./scripts/deploy.sh SEGRETO', ['bash'], 'altro'],
    ['tsc --noEmit', ['tsc'], 'build'],
    ['jq .x file.json', ['jq'], 'fs'],
    ['rm -rf build', ['rm'], 'fs'],
    ['git worktree add ../x', ['git worktree'], 'git'],
    ['git frobnicate SEGRETO', ['git *'], 'git'],
    ['dotnet test', ['dotnet test'], 'test'],
    ['terraform plan', ['terraform plan'], 'docker'],
    ['ssh user@host "ls"', ['ssh'], 'network'],
    ['wget https://x.example/f.zip', ['wget'], 'network'],
    ['ruff check .', ['ruff'], 'altro'],
    ['eslint src --fix', ['eslint'], 'altro'],
    ['playwright test', ['playwright'], 'test'],
    ['bun test', ['bun test'], 'test'],
    ['deno test', ['deno test'], 'test'],
    ['claude plugin validate .', ['claude plugin'], 'altro'],
    ['$(echo SEGRETO)', [], 'altro'],
    ['', [], 'altro'],
  ]

  for (const [command, cmds, cat] of cases) {
    test(`${JSON.stringify(command).slice(0, 60)}`, () => {
      const info = classifyBash(command)

      expect(info.cmds).toEqual(cmds)
      expect(info.cat).toBe(cat)
    })
  }

  test('privacy: nessun argomento esce, ogni token è un nome sicuro', () => {
    for (const [command] of cases) {
      const info = classifyBash(command)

      for (const cmd of info.cmds) {
        expect(cmd.toLowerCase()).not.toContain('segreto')

        for (const token of cmd.split(' ')) {
          expect(/^([a-z0-9][a-z0-9._:+-]{0,39}|\*|-m)$/i.test(token)).toBe(true)
        }
      }
    }
  })

  test('pipe segnalata', () => {
    expect(classifyBash('npm test | tee out.txt').pipe).toBe(true)
    expect(classifyBash('npm test || echo ko').pipe).toBe(false)
  })
})

describe('righe di codice', () => {
  test('structuredPatch, gitDiff e file creati', () => {
    expect(countPatch([{ lines: [' a', '+b', '+c', '-d'] }])).toEqual({ add: 2, del: 1 })
    expect(linesOfResult({ structuredPatch: [{ lines: ['+x', '-y'] }], gitDiff: { additions: 10, deletions: 3 } })).toEqual({ add: 10, del: 3, created: false })
    expect(linesOfResult({ type: 'create', content: 'a\nb\nc\n', structuredPatch: [] })).toEqual({ add: 3, del: 0, created: true })
    expect(lineCount('a\nb')).toBe(2)
  })

  test('classe dei file', () => {
    expect(classOf('/r/src/main/java/App.java')).toBe('src')
    expect(classOf('/r/src/test/java/AppTest.java')).toBe('test')
    expect(classOf('/r/web/app.spec.ts')).toBe('test')
    expect(classOf('/r/README.md')).toBe('doc')
    expect(classOf('/r/pom.xml')).toBe('config')
    expect(classOf('/r/logo.png')).toBe('altro')
    expect(classOf('/r/cobol/PAYROLL.CBL')).toBe('cobol')
    expect(classOf('/r/copy/CUSTREC.cpy')).toBe('cobol')
    expect(classOf('/r/src/legacy.cob')).toBe('cobol')
    expect(classOf('/r/jcl/NIGHTLY.JCL')).toBe('mainframe')
    expect(classOf('/r/pli/calc.pli')).toBe('mainframe')
    expect(classOf('/r/exec/deploy.rexx')).toBe('mainframe')
    expect(classOf('/r/tests/PAYROLL.cbl')).toBe('test')
  })

  test('il reducer ricava la classe dal percorso, anche dagli eventi salvati con la classe di prima', () => {
    const state = foldEvents({ summary: emptySummary(), details: emptyDetails() }, events([
      [T0, { e: 'tool', id: 'u1', tool: 'Edit', st: 'ok', wall: 5, x: { k: 'file', op: 'edit', path: '/w/src/PAYROLL.cbl', ext: 'cbl', cls: 'src', add: 7, del: 1 } }],
      [T0 + 1, { e: 'tool', id: 'u2', tool: 'Write', st: 'ok', wall: 5, x: { k: 'file', op: 'write', path: '/w/jcl/RUN.jcl', ext: 'jcl', cls: 'altro', add: 3, cr: 1 } }],
    ]))

    expect(state.summary.files.byClass).toEqual({ cobol: { n: 1, add: 7, del: 1 }, mainframe: { n: 1, add: 3, del: 0 } })
    expect(state.details.files['/w/src/PAYROLL.cbl']?.cls).toBe('cobol')
    expect(state.summary.rv).toBe(REDUCER_VERSION)
  })
})

describe('documenti creati', () => {
  test('git status porcelain v2: HEAD, nuovi, modificati, rinominati; cancellati e altri file esclusi', () => {
    const text = [
      '# branch.oid 582dbd048743be376092c2233078e62b62ab9396',
      '# branch.head main',
      '1 .M N... 100644 100644 100644 7898192 7898192 conti/budget 2026.xlsx',
      '1 A. N... 000000 100644 100644 0000000 1234567 nuovo.odt',
      '1 .D N... 100644 100644 000000 7898192 7898192 vecchio.pdf',
      '2 R. N... 100644 100644 100644 7898192 7898192 R100 slides/finale.pptx',
      'slides/bozza.pptx',
      '? sub dir/Relazione.DOCX',
      '? appunti.txt',
      '',
    ].join('\0')
    const parsed = parseStatus(text)

    expect(parsed.head).toBe('582dbd048743be376092c2233078e62b62ab9396')
    expect([...parsed.files]).toEqual([
      ['conti/budget 2026.xlsx', 'changed'],
      ['nuovo.odt', 'new'],
      ['slides/finale.pptx', 'changed'],
      ['sub dir/Relazione.DOCX', 'new'],
    ])
    expect(parseStatus('# branch.oid (initial)\0').head).toBe(null)
    expect(parseDiff(['A', 'a.pdf', 'M', 'b.xlsx', 'R100', 'c.doc', 'd.docx', 'A', 'e.txt', ''].join('\0'))).toEqual({ added: ['a.pdf'], modified: ['b.xlsx'] })
  })

  test('confronto: creati, rigenerati per stato o ora di modifica, aggiunti o modificati in un commit', () => {
    const snap = (entries: [string, 'new' | 'changed', number | null][], head = 'a1b2c3d') => ({ head, files: new Map(entries.map(([path, state, mtime]) => [path, { state, mtime }])) })
    const before = snap([['old.pdf', 'new', 1], ['budget.xlsx', 'changed', 5]])
    const after = snap([['old.pdf', 'new', 2], ['budget.xlsx', 'changed', 5], ['nuovo.docx', 'new', 3], ['slides.pptx', 'changed', 4]])

    expect(compareDocs(before, after, null)).toEqual({ created: { docx: 1 }, regen: { pdf: 1, pptx: 1 } })
    expect(compareDocs(before, snap([]), { added: ['x.odt', 'old.pdf'], modified: ['y.ods', 'budget.xlsx'] })).toEqual({ created: { odt: 1 }, regen: { ods: 1 } })
    expect(DOCUMENT_EXT.every(ext => classOf(`/w/out/file.${ext}`) === 'doc')).toBe(true)
  })
})

describe('categorie di attività', () => {
  const L = i18nOf('it')
  const parsed = parseRules(L, JSON.stringify({ colonna: 'categoria', parole: { docs: 'DOCUMENTAZIONE', dev: 'SVILUPPO', qa: 'TEST' }, ripiego: { doc: 'DOCUMENTAZIONE', test: 'TEST', src: 'SVILUPPO' } }))
  const rules = 'rules' in parsed ? parsed.rules : (null as never)
  /** Una sessione con i branch di `meta.branches`, l'ultimo branch del reducer e le righe aggiunte per classe. */
  const session = (branches: string[], last: string | null = branches.at(-1) ?? null, added: Record<string, number> = {}): KpiSessionFile => {
    const summary = emptySummary()

    summary._r.branch = last

    for (const [cls, add] of Object.entries(added)) {
      summary.files.byClass[cls] = { n: 1, add, del: 0 }
    }

    return { meta: { branches, repo: null, models: [], versions: [], permissionModes: {} }, summary } as unknown as KpiSessionFile
  }

  test('parola chiave nel branch: parole intere su - _ / ., senza maiuscole; la prima da sinistra; l\'ultimo branch che ne ha una', () => {
    expect(categoryOf(rules, session(['feature/PROJ-123-docs']))).toBe('DOCUMENTAZIONE')
    expect(categoryOf(rules, session(['Feature/DOCS.v2']))).toBe('DOCUMENTAZIONE')
    expect(categoryOf(rules, session(['latest-fix']))).toBe(null)
    expect(categoryOf(rules, session(['testing']))).toBe(null)
    expect(categoryOf(rules, session(['qa/docs-review']))).toBe('TEST')
    expect(categoryOf(rules, session(['dev/login', 'qa/login', 'main']))).toBe('TEST')
    // L'ultimo branch esatto viene dal reducer: A → B → A con A in fondo solo nel summary.
    expect(categoryOf(rules, session(['qa/login', 'dev/login'], 'qa/login'))).toBe('TEST')
  })

  test('senza parola chiave: la classe di ripiego con più righe aggiunte, a parità l\'ordine delle chiavi; zero righe nessuna categoria', () => {
    expect(categoryOf(rules, session(['main'], 'main', { src: 10, doc: 30, test: 30, config: 100 }))).toBe('DOCUMENTAZIONE')
    expect(categoryOf(rules, session([], null, { src: 5 }))).toBe('SVILUPPO')
    expect(categoryOf(rules, session(['main'], 'main', { config: 40 }))).toBe(null)
    expect(categoryOf(rules, session([], null))).toBe(null)
  })

  test('filtro per etichetta, parola chiave o nessuna; nome della colonna', () => {
    const categories = categoriesOf(L, rules)
    const docs = session(['feature/docs'])

    expect(categories.column).toBe('categoria')
    expect(categories.matches(docs, ['docs'])).toBe(true)
    expect(categories.matches(docs, ['documentazione'])).toBe(true)
    expect(categories.matches(docs, ['qa', 'sviluppo'])).toBe(false)
    expect(categories.matches(session(['main']), ['nessuna'])).toBe(true)
    expect(categories.matches(session(['main']), ['none'])).toBe(true)
  })

  test('file in inglese e file non validi', () => {
    const english = parseRules(i18nOf('en'), JSON.stringify({ keywords: { Docs: 'Docs' }, fallback: { other: 'Misc' } }))

    expect('rules' in english && english.rules.fallback).toEqual([['altro', 'Misc']])
    expect('rules' in english && categoriesOf(i18nOf('en'), english.rules).column).toBe('category')

    const error = (value: string) => {
      const result = parseRules(L, value)

      return 'error' in result ? result.error : ''
    }

    expect(error('{ "parole": ')).toMatch(/^JSON non valido: /)
    expect(error('[]')).toBe('il file deve contenere un oggetto JSON')
    expect(error('{}')).toBe('nessuna regola: servono "parole" o "ripiego"')
    expect(error(JSON.stringify({ colonna: 3, parole: { a: 'b' } }))).toBe('"colonna" deve essere un testo')
    expect(error(JSON.stringify({ parole: { a: 1 } }))).toBe('"parole" deve essere un oggetto da testo a testo')
    expect(error(JSON.stringify({ parole: { 'code-review': 'X' } }))).toContain('contiene un separatore')
    expect(error(JSON.stringify({ ripiego: { sorgenti: 'X' } }))).toContain('classe di ripiego sconosciuta "sorgenti"')
  })
})

describe('tipo di sessione', () => {
  test('interattiva, print (claude -p), sdk, desktop', () => {
    expect(kindOf(true, 'terminal', 'cli')).toBe('interattiva')
    expect(kindOf(false, null, 'sdk-cli')).toBe('print')
    expect(kindOf(false, null, 'sdk-ts')).toBe('sdk')
    expect(kindOf(false, null, undefined)).toBe('print')
    expect(kindOf(true, 'desktop', 'cli')).toBe('desktop')
    expect(kindOf(null, null, undefined)).toBe('sconosciuta')
  })
})

describe('esito dei tool', () => {
  test('statusOf e host degli URL', () => {
    expect(statusOf({ deny: 'no' })).toBe('deny')
    expect(statusOf({ isError: true, result: 'x', text: 'boom' })).toBe('err')
    expect(statusOf({ isError: true, result: 'x', text: 'Interrupted by user' })).toBe('intr')
    expect(statusOf({ result: { interrupted: true } })).toBe('intr')
    // I testi del motore (Claude Code 2.1.312): rifiuto nel dialogo, regola, modalità, hook, classificatore, chiamate non eseguite.
    const error = (text: string) => statusOf({ isError: true, result: text, text })

    expect(error("The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.")).toBe('rej')
    expect(error("The user doesn't want to take this action right now. STOP what you are doing and wait for the user to tell you how to proceed.")).toBe('rej')
    expect(error('<tool_use_error>Permission to use Bash with command git push has been denied.</tool_use_error>')).toBe('deny')
    expect(error("Permission to use Bash has been denied because Claude Code is running in don't ask mode.")).toBe('deny')
    expect(error('Permission to edit /w/a.ts has been denied.')).toBe('deny')
    expect(error("Hook 'guard' blocked this action: no")).toBe('deny')
    expect(error('Permission for this action has been denied. Reason: rete')).toBe('cls')
    expect(error('[Request interrupted by user for tool use]')).toBe('intr')
    expect(error("[Tool call not completed: an approval request expired with no answer, so the action awaiting approval did not run. Nobody refused it, so this is not the user's decision; ask again if it is still needed.]")).toBe('intr')
    // Un comando fallito che stampa quelle frasi a metà output resta un errore.
    expect(error("grep: trovato \"The user doesn't want to proceed with this tool use\"")).toBe('err')
    expect(statusOf({ result: {} })).toBe('ok')
    expect(urlHost('https://docs.example.com/a?tok=SEGRETO')).toBe('docs.example.com')
  })
})

const events = (bodies: [number, KpiEventBody, string?][]): KpiEvent[] => bodies.map(([t, body, a], index) => ({ q: index + 1, t, ...(a !== undefined && { a }), ...body }) as KpiEvent)

const SAMPLE = events([
  [T0, { e: 'seg.start', seg: 's01-aaaa', src: 'startup', ver: '2.1.296', kind: 'interattiva', tz: 0, cost0: 0 }],
  [T0 + 1, { e: 'prompt', o: 'composer', ch: 10, w: 2, ln: 1 }],
  [T0 + 2, { e: 'turn.start', tu: 't1' }],
  [T0 + 3, { e: 'step', tu: 't1', i: 0, m: 'opus', ms: 900, ttft: 300, gen: 600, in: 10, out: 60, cr: 100, cw: 5, stop: 'tool_use', tools: 1 }],
  [T0 + 4, { e: 'tool', id: 'u1', tool: 'Edit', st: 'ok', wall: 20, x: { k: 'file', op: 'edit', path: '/w/a.ts', ext: 'ts', cls: 'src', add: 5, del: 2 } }],
  [T0 + 5, { e: 'tool.ms', id: 'u1', tool: 'Edit', ms: 15 }],
  [T0 + 6, { e: 'tool', id: 'u2', tool: 'Bash', st: 'err', wall: 900, x: { k: 'bash', cmds: ['npm test'], cat: 'test' } }],
  [T0 + 7, { e: 'step', tu: 't1', i: 1, m: 'opus', ms: 500, in: 5, out: 20, cr: 200, cw: 0, stop: 'end_turn', tools: 0 }],
  [T0 + 8, { e: 'turn.end', tu: 't1', ms: 3000, r: 'answer', m: 'opus', in: 15, out: 80, cr: 300, cw: 5, ns: 2, ans: 40 }],
  [T0 + 9, { e: 'measure', cost: 0.5, ctx: 30000, win: 200000, pct: 15, rl: [['five_hour', 20]] }],
  [T0 + 10, { e: 'agent.spawn', id: 'ag1', type: 'Explore', m: 'haiku' }],
  [T0 + 11, { e: 'step', tu: 'ta', i: 0, m: 'haiku', ms: 200, in: 1, out: 2, cr: 3, cw: 4, stop: 'end_turn', tools: 0 }, 'ag1'],
  [T0 + 12, { e: 'turn.end', tu: 'ta', ms: 800, r: 'answer', ns: 1, ans: 5 }, 'ag1'],
  [T0 + 13, { e: 'measure', cost: 0.75 }],
])

describe('reducer', () => {
  test('fold di una sessione di esempio', () => {
    const state = foldEvents({ summary: emptySummary(), details: emptyDetails() }, SAMPLE)
    const s = state.summary

    expect(s.turns.main).toBe(1)
    expect(s.turns.sub).toBe(1)
    expect(s.requests.n).toBe(3)
    expect(s.tokens).toEqual({ in: 16, out: 82, cr: 303, cw: 9 })
    expect(s.tokensSub).toEqual({ in: 1, out: 2, cr: 3, cw: 4 })
    expect(s.cost.usd).toBe(0.75)
    expect(s.files.add).toBe(5)
    expect(s.files.uniqueModified).toBe(1)
    expect(s.tests.err).toBe(1)
    expect(s.tools.byTool.Edit?.ms.n).toBe(1)
    expect(s.agents.byType.Explore?.ms).toBe(800)
    expect(s.byDay['2026-10-12']?.turns).toBe(1)
    expect(state.details.turns[0]?.tools).toBe(2)
    expect(state.details.turns[0]?.err).toBe(1)
  })

  test('senza metriche per richiesta i token arrivano da turn.end', () => {
    const state = foldEvents({ summary: emptySummary(), details: emptyDetails() }, [
      { q: 1, t: T0, e: 'turn.start', tu: 't1' },
      { q: 2, t: T0, e: 'turn.end', tu: 't1', ms: 10, r: 'answer', m: 'opus', in: 1, out: 2, cr: 3, cw: 4, ns: 0, ans: 0 },
    ])

    expect(state.summary.tokens).toEqual({ in: 1, out: 2, cr: 3, cw: 4 })
  })

  test('snapshot + replay = fold completo; merge associativo', () => {
    const full = foldEvents({ summary: emptySummary(), details: emptyDetails() }, SAMPLE)
    const half = foldEvents({ summary: emptySummary(), details: emptyDetails() }, SAMPLE.slice(0, 7))
    const restored = foldEvents(JSON.parse(JSON.stringify(half)), SAMPLE.slice(7))

    expect(JSON.stringify(restored.summary)).toBe(JSON.stringify(full.summary))

    const a = full.summary
    const left = mergeSummary(mergeSummary(mergeAll([]), a), a)
    const right = mergeAll([a, a])

    expect(left.tokens.in).toBe(32)
    expect(right.cost.usd).toBe(1.5)
    expect(right.context.maxPct).toBe(15)
  })

  test('JSONL: codifica e decodifica, righe rotte saltate', () => {
    const text = `${SAMPLE.map(encodeEvent).join('\n')}\n{"q":99,"t":1,"e":"tool"`

    expect(decodeEvents(text)).toHaveLength(SAMPLE.length)
  })

  test('percentili dall\'istogramma', () => {
    const stat = emptyStat()

    for (let value = 1; value <= 100; value += 1) addStat(stat, value * 100)

    expect(percentileOf(stat, 0.5)).toBeGreaterThan(4000)
    expect(percentileOf(stat, 0.5)).toBeLessThan(6000)
  })
})

/** Un segmento ridotto ai soli eventi di costo: sorgente, costo di partenza, letture, fine (`null` = interrotto), `sw`. */
type CostSegment = [src: string, cost0: number, measures: number[], end: string | null, sw?: 0 | 1]

const costSession = (segments: CostSegment[]): KpiEvent[] => {
  const bodies: [number, KpiEventBody][] = []
  let t = T0

  segments.forEach(([src, cost0, measures, end, sw], index) => {
    bodies.push([(t += 1000), { e: 'seg.start', seg: `s0${index + 1}-aaaa`, src, ver: '2.1.299', kind: 'interattiva', tz: 0, cost0, ...(sw !== undefined && { sw }) }])

    for (const cost of measures) {
      bodies.push([(t += 1000), { e: 'measure', cost }])
    }

    if (end !== null) {
      bodies.push([(t += 1000), { e: 'seg.end', reason: end }])
    }
  })

  return events(bodies)
}

const costOf = (segments: CostSegment[]) => foldEvents({ summary: emptySummary(), details: emptyDetails() }, costSession(segments)).summary.cost

const near = (value: number | undefined, expected: number): boolean => Math.abs((value ?? 0) - expected) < 1e-6

describe('costo tra i segmenti', () => {
  // I costi di partenza e le letture di due sessioni reali (0.3.0): il ledger di Claude Code finiva a $7,0296 e $12,3472.
  test('ricariche e riprese da un processo nuovo: il costo tra i segmenti si recupera', () => {
    const a = costOf([
      ['startup', 0, [0, 3.1411474], null],
      ['ricarica', 3.3924726, [], 'prompt_input_exit'],
      ['resume', 3.4363558, [3.735173, 4.0506282], 'prompt_input_exit'],
      ['resume', 4.1024132, [4.2160856, 4.357721], null],
      ['ricarica', 4.488264, [5.4077388, 5.4831036], 'prompt_input_exit'],
      ['resume', 5.5447714, [5.7183738], null],
      ['ricarica', 5.8819922, [6.1514136, 6.6856202], null],
      ['ricarica', 6.6994982, [], 'prompt_input_exit'],
      ['resume', 6.6994982, [6.9574628, 7.0296358], 'prompt_input_exit'],
    ])

    expect(near(a.usd, 7.0296358)).toBe(true)
    expect(near(a.outsideTurns, 7.0296358 - 6.3129352)).toBe(true)

    const b = costOf([
      ['startup', 0, [0, 8.2694167], null],
      ['ricarica', 8.4985991, [8.7256021, 8.9407861], null],
      ['ricarica', 8.9407861, [], null],
      ['ricarica', 8.9407861, [9.1697739, 11.8028367], null],
      ['ricarica', 12.2531003, [], 'other'],
      ['resume', 12.3471987, [], 'clear'],
    ])

    expect(near(b.usd, 12.3471987)).toBe(true)
  })

  test('cambio di sessione nello stesso processo: il ledger è di un\'altra sessione, nessun recupero', () => {
    // Prima della 0.4.0 lo si deduce dalla fine del segmento precedente.
    expect(near(costOf([['startup', 0, [1], 'resume'], ['resume', 3, [3.2], 'prompt_input_exit']]).usd, 1.2)).toBe(true)
    expect(near(costOf([['startup', 0, [1], 'clear'], ['resume', 3, [3.2], null]]).usd, 1.2)).toBe(true)
    // Dalla 0.4.0 lo dice `sw`.
    expect(near(costOf([['startup', 0, [1], 'prompt_input_exit', 0], ['resume', 3, [3.2], null, 1]]).usd, 1.2)).toBe(true)
    expect(near(costOf([['startup', 0, [1], 'prompt_input_exit', 0], ['resume', 3, [3.2], null, 0]]).usd, 3.2)).toBe(true)
  })

  test('ledger azzerato o più basso: nessun recupero, e un avvio nuovo non recupera mai', () => {
    expect(near(costOf([['startup', 0, [1], 'prompt_input_exit'], ['resume', 0.1, [0.3], null]]).usd, 1.2)).toBe(true)
    expect(near(costOf([['startup', 0, [1], 'prompt_input_exit'], ['startup', 2, [2.5], null]]).usd, 1.5)).toBe(true)
  })

  test('la ripresa annunciata dopo l\'apertura (seg.src) si conta una volta sola', () => {
    const list = costSession([['startup', 0, [1], 'prompt_input_exit'], ['startup', 1.5, [], null]])
    const t = (list.at(-1) as KpiEvent).t

    list.push({ q: 90, t: t + 1, e: 'seg.src', src: 'resume' }, { q: 91, t: t + 2, e: 'seg.src', src: 'resume' }, { q: 92, t: t + 3, e: 'measure', cost: 2 })

    const cost = foldEvents({ summary: emptySummary(), details: emptyDetails() }, list).summary.cost

    expect(near(cost.usd, 2)).toBe(true)
    expect(near(cost.outsideTurns, 0.5)).toBe(true)
  })

  test('una lettura fuori dai turni va alla sessione e al giorno, non al turno', () => {
    const state = foldEvents({ summary: emptySummary(), details: emptyDetails() }, [...SAMPLE.slice(0, 10), { q: 20, t: T0 + 20, e: 'measure', p: 1, cost: 0.6 }])
    const s = state.summary

    expect(near(s.cost.usd, 0.6)).toBe(true)
    expect(near(s.cost.outsideTurns, 0.1)).toBe(true)
    expect(s.cost.perTurn.n).toBe(1)
    expect(near(s.byDay['2026-10-12']?.cost, 0.6)).toBe(true)
    expect(state.details.turns[0]?.cost).toBe(0.5)
  })
})

describe('argomenti e filtri', () => {
  test('sottocomandi con alias, opzioni, virgolette', () => {
    expect(words('a "b c" \'d\'')).toEqual(['a', 'b c', 'd'])

    const parsed = parseArgs('stats --project demo,altro --since 7d --by modello --ctx')

    expect(parsed.sub).toBe('statistiche')
    expect(parsed.flags.progetto).toEqual(['demo', 'altro'])
    expect(parsed.flags.per).toEqual(['modello'])
    expect(parsed.bools.has('ctx')).toBe(true)
    expect(parseArgs('').sub).toBe('riepilogo')
    expect(parseArgs('boh').unknown).toBe('boh')
    expect(parseArgs('sessioni --xyz').errors).toHaveLength(1)
  })

  test('date relative e assolute', () => {
    const now = Date.UTC(2026, 9, 12, 12)

    expect(dayOfArg('oggi', now, 0)).toBe('2026-10-12')
    expect(dayOfArg('ieri', now, 0)).toBe('2026-10-11')
    expect(dayOfArg('7d', now, 0)).toBe('2026-10-06')
    expect(dayOfArg('2w', now, 0)).toBe('2026-09-29')
    expect(dayOfArg('01/10/2026', now, 0)).toBe('2026-10-01')
    expect(dayOfArg('2026-10-01', now, 0)).toBe('2026-10-01')
    expect(dayOfArg('domani', now, 0)).toBe(null)
    expect(dayOfArg('1/2/2026', now, 0)).toBe('2026-02-01')
    expect(dayOfArg('29/02/2028', now, 0)).toBe('2028-02-29')
    expect(dayOfArg('32/13/2026', now, 0)).toBe(null)
    expect(dayOfArg('29/02/2026', now, 0)).toBe(null)
    expect(dayOfArg('2026-02-30', now, 0)).toBe(null)
    expect(dayOfArg('2026-00-10', now, 0)).toBe(null)
    expect(daysOfAge('180d')).toBe(180)
    expect(daysOfAge('6m')).toBe(180)
  })

  test('filtro di progetto', () => {
    const { filter } = filterOf(i18nOf('it'), parseArgs('stats --progetto .'), Date.now(), '/work/x')

    expect(matchesProject(filter, '/work/x', 'x')).toBe(true)
    expect(matchesProject(filter, '/work/x2', 'x2')).toBe(false)
  })

  test('errori e descrizione del filtro nella lingua, con l\'opzione come l\'ha scritta l\'utente', () => {
    const now = Date.UTC(2026, 9, 12, 12)
    const it = filterOf(i18nOf('it'), parseArgs('stats --da domani --tipo boh'), now, null)
    const en = filterOf(i18nOf('en'), parseArgs('stats --since tomorrow --kind interactive'), now, null)

    expect(it.errors).toEqual(['tipo di sessione sconosciuto: boh', 'data non valida per --da: domani'])
    expect(en.errors).toEqual(['invalid date for --since: tomorrow'])
    expect(describeFilter(i18nOf('en'), en.filter)).toBe('kind interactive')
    expect(describeFilter(i18nOf('it'), { ...en.filter, sinceDay: '2026-10-01' })).toBe('periodo 2026-10-01 → oggi · tipo interattiva')
    expect(parseArgs('stats --lang en --since').errors).toEqual([{ kind: 'valore', name: 'since' }])
    expect(parseArgs('report --lingua en').flags.lingua).toEqual(['en'])
    expect(langOf('English')).toBe('en')
    expect(langOf('italiano')).toBe('it')
    expect(langOf('fr')).toBe(null)
  })
})

describe('formattazione', () => {
  test('numeri, valuta e durate in italiano', () => {
    expect(fixed(12345.678, 2)).toBe('12.345,68')
    expect(compact(312_000)).toBe('312k')
    expect(compact(2_100_000)).toBe('2,1M')
    expect(usd(1.4234)).toBe('$1,42')
    expect(usd(0.0791)).toBe('$0,079')
    expect(dur(72_000)).toBe('1m 12s')
    expect(dur(4_320_000)).toBe('1h 12m')
    expect(dur(97_200_000)).toBe('1g 3h')
  })

  test('numeri, date e durate in inglese; codici salvati tradotti', () => {
    const en = i18nOf('en')
    const t = Date.UTC(2026, 9, 12, 10, 31)

    expect(en.fixed(12345.678, 2)).toBe('12,345.68')
    expect(en.compact(2_100_000)).toBe('2.1M')
    expect(en.usd(1.4234)).toBe('$1.42')
    expect(en.dur(97_200_000)).toBe('1d 3h')
    expect(en.dateTime(t, 0)).toBe('2026-10-12 10:31')
    expect(i18nOf('it').dateTime(t, 0)).toBe('12/10/2026 10:31')
    expect(en.dayLabel('2026-10-12')).toBe('2026-10-12')
    expect(en.count(1, 'sessione', 'sessioni')).toBe('1 session')
    expect(en.count(3, 'sessione', 'sessioni')).toBe('3 sessions')
    expect(en.t('Esportate {rows} ({level}) in {where}{kind}.', { rows: '3 rows', level: 'days', where: '/x', kind: '' })).toBe('Exported 3 rows (days) to /x.')
    expect(en.code('interattiva')).toBe('interactive')
    expect(en.code('ricarica')).toBe('reload')
    expect(en.code('Bash')).toBe('Bash')
    expect(i18nOf('it').code('interattiva')).toBe('interattiva')
  })

  test('CSV Excel italiano e standard', () => {
    const table = { columns: ['a', 'b'], rows: [[1.5, 'x;y'], [2, 'q"q']] }
    const excel = csvParts(table, true)[0] as string
    const standard = csvParts(table, false)[0] as string

    expect(excel.startsWith('\uFEFFa;b\r\n')).toBe(true)
    expect(excel).toContain('1,5;"x;y"')
    expect(standard).toBe('a,b\n1.5,x;y\n2,"q""q"\n')
  })

  test('HTML sicuro', () => {
    expect(embedJson({ x: '</script><b>' })).not.toContain('</')
    expect(escapeHtml('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;')
  })
})

describe('interfaccia', () => {
  test('livelli a soglia di contesto e rate limit', () => {
    expect(toneOf(null)).toBe('ok')
    expect(toneOf(49)).toBe('ok')
    expect(toneOf(50)).toBe('warn')
    expect(toneOf(79)).toBe('warn')
    expect(toneOf(80)).toBe('bad')
    expect(toneOf(100)).toBe('bad')
    expect(worstOf('ok', 'warn')).toBe('warn')
    expect(worstOf('warn', 'bad', 'ok')).toBe('bad')
    expect(worstOf()).toBe('ok')
  })
})
