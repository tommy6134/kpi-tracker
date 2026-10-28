/* kpi-tracker · dashboard HTML offline. JS puro, nessuna dipendenza. In italiano o in inglese, commutabile dalla pagina. */
(function () {
  'use strict'

  var DATA = JSON.parse(document.getElementById('kpi-data').textContent)
  var D = DATA.dict
  var SVGNS = 'http://www.w3.org/2000/svg'

  // Indici delle tuple (vedi hooks/report/html.ts).
  var S = { id: 0, project: 1, path: 2, kind: 3, start: 4, last: 5, status: 6, branches: 7, models: 8, repo: 9, segments: 10, ctxMax: 11, r5: 12, r7: 13, compactions: 14, agents: 15, pushes: 16, prs: 17, testsOk: 18, testsKo: 19, buildsOk: 20, buildsKo: 21, created: 22, modified: 23, read: 24, subTurns: 25, ttft: 26, allow: 27, ask: 28, deny: 29, dialogs: 30, turnErr: 31, interrupts: 32, refusals: 33, version: 34, costOut: 35, rejected: 36, clsDenied: 37, category: 38, docs: 39, docsRegen: 40 }
  var DAY = { s: 0, day: 1, cost: 2, inp: 3, out: 4, cr: 5, cw: 6, turns: 7, active: 8, prompts: 9, req: 10, tools: 11, toolErr: 12, add: 13, del: 14, commits: 15 }

  // ------------------------------------------------------------ lingua

  // Il testo italiano è la chiave; `{nome}` è un segnaposto.
  var EN = {
    'KPI di Claude Code': 'Claude Code KPIs',
    'Lingua': 'Language',
    'Tema': 'Theme',
    'Automatico': 'Automatic',
    'Chiaro': 'Light',
    'Scuro': 'Dark',
    'Filtri': 'Filters',
    'Indicatori principali': 'Key indicators',
    'tutti': 'all',
    '{n} scelti': '{n} selected',
    '(vuoto)': '(empty)',
    'Periodo': 'Period',
    'Tutto lo storico': 'All history',
    'Oggi': 'Today',
    'Ultimi 7 giorni': 'Last 7 days',
    'Ultimi 30 giorni': 'Last 30 days',
    'Ultimi 90 giorni': 'Last 90 days',
    'Personalizzato…': 'Custom…',
    'Dal': 'From',
    'Al': 'To',
    'Progetto': 'Project',
    'Tipo': 'Kind',
    'Modello': 'Model',
    'Cerca id o progetto': 'Search id or project',
    'Cerca': 'Search',
    'Azzera filtri': 'Reset filters',
    'Tabella': 'Table',
    'Grafico': 'Chart',
    'Nessun dato nel periodo': 'No data in the period',
    'Grafico a colonne': 'Column chart',
    'Grafico a barre': 'Bar chart',
    'Attività per ora e giorno': 'Activity by hour and day',
    'turno': 'turn',
    'turni': 'turns',
    'Generato il {date} · {description} · {n} sessioni nel filtro': 'Generated on {date} · {description} · {n} sessions in the filter',
    'Per stare nel limite di dimensione, le distribuzioni (tool, modelli, comandi…) delle sessioni più vecchie non sono incluse; totali e andamenti giornalieri sono completi. Rigenera con un periodo più corto per averle tutte.': 'To stay within the size limit, the distributions (tools, models, commands…) of the oldest sessions are not included; totals and daily trends are complete. Generate again with a shorter period to get them all.',
    'Costo': 'Cost',
    '{cost} per turno': '{cost} per turn',
    'Sessioni': 'Sessions',
    '{n} progetto': '{n} project',
    '{n} progetti': '{n} projects',
    'Turni': 'Turns',
    '{n} prompt': '{n} prompts',
    'Tempo attivo': 'Active time',
    '{time} per turno': '{time} per turn',
    'Token totali': 'Total tokens',
    'letti {n}': 'read {n}',
    'Tool call': 'Tool calls',
    '{pct} in errore': '{pct} failed',
    'Righe': 'Lines',
    'nette {n}': 'net {n}',
    'Commit': 'Commits',
    'Test': 'Tests',
    '{ok} superati · {ko} falliti': '{ok} passed · {ko} failed',
    '{n} compattazione': '{n} compaction',
    '{n} compattazioni': '{n} compactions',
    'Giorno': 'Day',
    'Costo per giorno': 'Cost per day',
    'USD calcolati da Claude Code': 'USD as computed by Claude Code',
    'Cache letta': 'Cache read',
    'Cache scritta': 'Cache write',
    'Token per giorno': 'Tokens per day',
    'Impilati per tipo': 'Stacked by type',
    'Righe di codice per giorno': 'Lines of code per day',
    'Aggiunte sopra lo zero, rimosse sotto': 'Added above zero, removed below',
    'Aggiunte': 'Added',
    'Rimosse': 'Removed',
    'Turni per giorno': 'Turns per day',
    'Commit per giorno': 'Commits per day',
    'Turni per fascia oraria (ora locale)': 'Turns per hour slot (local time)',
    'Tool più usati': 'Most used tools',
    'Chiamate; nel tooltip errori e durata media': 'Calls; errors and mean duration in the tooltip',
    'errori': 'errors',
    'durata media': 'mean duration',
    'Chiamate': 'Calls',
    'Errori': 'Errors',
    'Durata media': 'Mean duration',
    'Bash per categoria': 'Bash by category',
    'Comandi; nel tooltip esiti': 'Commands; outcomes in the tooltip',
    'Categoria': 'Category',
    'Comandi': 'Commands',
    'Token per modello': 'Tokens per model',
    'Input + output + cache': 'Input + output + cache',
    'richieste': 'requests',
    'Richieste': 'Requests',
    'Comandi Bash più usati': 'Most used Bash commands',
    'Solo programma e sottocomando': 'Program and subcommand only',
    'Comando': 'Command',
    'Volte': 'Times',
    'Righe per estensione': 'Lines per extension',
    'Documenti creati': 'Documents created',
    'Per estensione, dai comandi Bash (git status del repo)': 'By extension, from Bash commands (git status of the repo)',
    'Creati': 'Created',
    'Rigenerati': 'Regenerated',
    'Documenti creati · rigenerati': 'Documents created · regenerated',
    'Aggiunte + rimosse': 'Added + removed',
    'aggiunte': 'added',
    'rimosse': 'removed',
    'Estensione': 'Extension',
    'Modifiche': 'Edits',
    'Durata dei turni': 'Turn duration',
    'Numero di turni per fascia di durata': 'Number of turns per duration band',
    'Fascia': 'Band',
    'Subagent per tipo': 'Subagents by type',
    'Avvii; nel tooltip durata e token': 'Launches; duration and tokens in the tooltip',
    'durata totale': 'total duration',
    'token': 'tokens',
    'Avvii': 'Launches',
    'Durata': 'Duration',
    'Invocazioni': 'Invocations',
    'Comandi slash': 'Slash commands',
    'Server MCP': 'MCP servers',
    'Consentiti': 'Allowed',
    'Chiesti': 'Asked',
    'Negati': 'Denied',
    'Negate da regola, modalità o hook': 'Denied by a rule, the mode or a hook',
    "Rifiutate dall'utente": 'Rejected by the user',
    'Negate dal classificatore': 'Denied by the classifier',
    'Dialoghi mostrati': 'Dialogs shown',
    'Permessi': 'Permissions',
    'Decisione': 'Decision',
    'turni in errore': 'failed turns',
    'interruzioni': 'interrupts',
    'rifiuti': 'refusals',
    'Errori e interruzioni': 'Errors and interrupts',
    'Motivi di stop delle richieste': 'Request stop reasons',
    'Motivo': 'Reason',
    'kpi-tracker · dati registrati localmente da Claude Code · il costo è quello calcolato da Claude Code (equivalente API) · nessun testo di prompt o risposte è incluso.': 'kpi-tracker · data recorded locally by Claude Code · cost as computed by Claude Code (API equivalent) · no prompt or response text is included.',
    'Sessioni ({n})': 'Sessions ({n})',
    'Clic su una riga per il dettaglio · clic sulle intestazioni per ordinare': 'Click a row for the detail · click the headers to sort',
    'Inizio': 'Start',
    'Attivo': 'Active',
    'Stato': 'Status',
    'Sessione': 'Session',
    'Percorso': 'Path',
    'Tipo · stato': 'Kind · status',
    'Ultima attività': 'Last activity',
    'Segmenti': 'Segments',
    'Versione': 'Version',
    'Modelli': 'Models',
    'Costo fuori dai turni': 'Cost outside turns',
    'Turni (subagent)': 'Turns (subagents)',
    'Prompt · richieste': 'Prompts · requests',
    'TTFT mediano': 'Median TTFT',
    'Contesto max': 'Max context',
    'Rate limit 5h · 7g (max)': 'Rate limit 5h · 7d (max)',
    'Compattazioni': 'Compactions',
    'Tool (errori)': 'Tools (errors)',
    'File creati · modificati · letti': 'Files created · modified · read',
    'Commit · push · PR': 'Commits · pushes · PRs',
    'Test ok · ko': 'Tests passed · failed',
    'Build ok · ko': 'Builds ok · failed',
    'Permessi consentiti · chiesti · negati · rifiutati': 'Permissions allowed · asked · denied · rejected',
    'Errori turno · interruzioni · rifiuti': 'Turn errors · interrupts · refusals',
    'Dettaglio sessione {id}': 'Session detail {id}',
    'Progetti ({n})': 'Projects ({n})',
    'Cartella dei report': 'Reports folder',
    'Cartella degli export': 'Exports folder',
    'Apri': 'Open',
    'Apre la cartella nel browser; il file manager si apre con il comando copiato': 'Opens the folder in the browser; the file manager opens with the copied command',
    'Copia percorso': 'Copy path',
    'Copia comando': 'Copy command',
    'Incollalo in Claude Code: apre la cartella nel file manager': 'Paste it into Claude Code: it opens the folder in the file manager',
    'Copiato': 'Copied',
  }

  var LOCALES = {
    it: { group: '.', decimal: ',', day: 'g', dmy: true, weekdays: ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'] },
    en: { group: ',', decimal: '.', day: 'd', dmy: false, weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  }

  // `#en` / `#it` nell'URL scelgono la lingua all'apertura.
  var hashLang = (window.location && window.location.hash || '').toLowerCase().replace('#', '')
  var lang = LOCALES[hashLang] ? hashLang : LOCALES[DATA.meta.lang] ? DATA.meta.lang : 'it'

  function t(text, params) {
    var out = lang === 'en' && EN[text] !== undefined ? EN[text] : text
    return params ? out.replace(/\{(\w+)\}/g, function (m, k) { return params[k] !== undefined ? String(params[k]) : m }) : out
  }
  /** `1 progetto`, `3 progetti`; `enOne` serve quando il singolare inglese ha una chiave italiana uguale al plurale (`prompt`). */
  function tn(n, one, many, enOne) {
    if (n === 1 && lang === 'en' && enOne) return enOne.replace('{n}', int(n))
    return t(n === 1 ? one : many, { n: int(n) })
  }
  /** L'etichetta di un codice salvato in italiano (tipo, stato, categorie…). */
  function code(value) { return lang === 'en' && DATA.codes && DATA.codes[value] !== undefined ? DATA.codes[value] : value }
  function loc() { return LOCALES[lang] }

  // ------------------------------------------------------------ formattazione

  function fixed(v, d) {
    if (!isFinite(v)) return '–'
    var neg = v < 0
    var parts = Math.abs(v).toFixed(d || 0).split('.')
    var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, loc().group)
    return (neg ? '−' : '') + whole + (parts[1] ? loc().decimal + parts[1] : '')
  }
  function int(v) { return fixed(Math.round(v), 0) }
  function compact(v) {
    var a = Math.abs(v)
    if (a < 1000) return int(v)
    var units = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k']]
    for (var i = 0; i < units.length; i++) {
      if (a >= units[i][0]) { var x = v / units[i][0]; return fixed(x, Math.abs(x) < 10 ? 1 : 0) + units[i][1] }
    }
    return int(v)
  }
  function usd(v) { var a = Math.abs(v); return a === 0 ? '$0' : '$' + fixed(v, a >= 100 ? 0 : a >= 1 ? 2 : a >= 0.01 ? 3 : 4) }
  function pct(f) { return isFinite(f) ? fixed(f * 100, 0) + '%' : '–' }
  function dur(ms) {
    if (!isFinite(ms) || ms < 0) return '–'
    if (ms < 1000) return Math.round(ms) + 'ms'
    var s = ms / 1000
    if (s < 60) return (s < 10 ? fixed(s, 1) : Math.round(s)) + 's'
    var m = Math.floor(s / 60)
    var rs = Math.round(s - m * 60)
    if (m < 60) return rs === 0 ? m + 'm' : m + 'm ' + rs + 's'
    var h = Math.floor(m / 60)
    if (h < 24) return m - h * 60 === 0 ? h + 'h' : h + 'h ' + (m - h * 60) + 'm'
    var g = Math.floor(h / 24)
    return h - g * 24 === 0 ? g + loc().day : g + loc().day + ' ' + (h - g * 24) + 'h'
  }
  function two(n) { return (n < 10 ? '0' : '') + n }
  function dayKey(ms) { var d = new Date(ms); return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) }
  function dayLabel(day) { var p = day.split('-'); return loc().dmy ? p[2] + '/' + p[1] : p[1] + '-' + p[2] }
  function dateTime(ms) {
    if (!ms) return '–'
    var d = new Date(ms)
    var date = loc().dmy ? two(d.getDate()) + '/' + two(d.getMonth() + 1) + '/' + d.getFullYear() : d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate())
    return date + ' ' + two(d.getHours()) + ':' + two(d.getMinutes())
  }
  function addDays(day, n) { var p = day.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]) + n * 864e5); return d.getUTCFullYear() + '-' + two(d.getUTCMonth() + 1) + '-' + two(d.getUTCDate()) }

  // ------------------------------------------------------------ DOM

  function el(tag, attrs, children) {
    var node = document.createElement(tag)
    for (var k in attrs || {}) {
      if (k === 'text') node.textContent = attrs[k]
      else if (k === 'class') node.className = attrs[k]
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k])
      else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) node.setAttribute(k, attrs[k])
    }
    ;(children || []).forEach(function (c) { if (c !== null && c !== undefined) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c) })
    return node
  }
  function svg(tag, attrs, children) {
    var node = document.createElementNS(SVGNS, tag)
    for (var k in attrs || {}) {
      if (k === 'text') node.textContent = attrs[k]
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k])
      else if (attrs[k] !== undefined && attrs[k] !== null) node.setAttribute(k, attrs[k])
    }
    ;(children || []).forEach(function (c) { if (c) node.appendChild(c) })
    return node
  }
  function css(name) { return getComputedStyle(document.body).getPropertyValue(name).trim() }

  // ------------------------------------------------------------ tooltip

  var tip = document.getElementById('kpi-tooltip')
  function showTip(evt, head, rows) {
    tip.textContent = ''
    tip.appendChild(el('div', { class: 't-head', text: head }))
    rows.forEach(function (r) {
      var row = el('div', { class: 't-row' })
      if (r.color) { var key = el('i', { class: 't-key' }); key.style.background = r.color; row.appendChild(key) }
      row.appendChild(el('b', { text: r.value }))
      row.appendChild(el('span', { text: r.label }))
      tip.appendChild(row)
    })
    tip.hidden = false
    var x = evt.clientX + 14, y = evt.clientY + 14
    var w = tip.offsetWidth, h = tip.offsetHeight
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - 14
    if (y + h > window.innerHeight - 8) y = evt.clientY - h - 14
    tip.style.left = x + 'px'
    tip.style.top = y + 'px'
  }
  function hideTip() { tip.hidden = true }

  // ------------------------------------------------------------ stato e filtri

  var allDays = DATA.days.map(function (d) { return d[DAY.day] }).sort()
  var firstDay = allDays[0] || dayKey(Date.now())
  var today = dayKey(DATA.meta.generatedAt)
  var state = { preset: 'tutto', from: firstDay, to: today, projects: [], kinds: [], models: [], branches: [], repos: [], categories: [], q: '', sort: { key: 'start', dir: -1 }, selected: null }

  function rangeDays() {
    if (state.preset === 'tutto') return [null, null]
    if (state.preset === 'oggi') return [today, today]
    if (state.preset === 'personalizzato') return [state.from, state.to]
    var n = +state.preset
    return [addDays(today, -(n - 1)), today]
  }
  function inRange(day) { var r = rangeDays(); return (r[0] === null || day >= r[0]) && (r[1] === null || day <= r[1]) }
  function anyIn(list, wanted) { if (wanted.length === 0) return true; for (var i = 0; i < list.length; i++) if (wanted.indexOf(list[i]) >= 0) return true; return false }

  function filtered() {
    var ids = {}
    var daysBySession = {}
    DATA.days.forEach(function (d) { if (inRange(d[DAY.day])) (daysBySession[d[DAY.s]] = daysBySession[d[DAY.s]] || []).push(d) })
    var rows = []
    DATA.sessions.forEach(function (s, i) {
      if (state.projects.length && state.projects.indexOf(s[S.project]) < 0) return
      if (state.kinds.length && state.kinds.indexOf(s[S.kind]) < 0) return
      if (!anyIn(s[S.models], state.models)) return
      if (!anyIn(s[S.branches], state.branches)) return
      if (state.repos.length && state.repos.indexOf(s[S.repo]) < 0) return
      if (state.categories.length && state.categories.indexOf(s[S.category]) < 0) return
      if (state.q && s[S.id].toLowerCase().indexOf(state.q.toLowerCase()) !== 0 && D.projects[s[S.project]].toLowerCase().indexOf(state.q.toLowerCase()) < 0) return
      var days = daysBySession[i] || []
      var r = rangeDays()
      if (r[0] !== null && days.length === 0) return
      rows.push({ i: i, s: s, days: days, m: DATA.maps[i] })
      ids[i] = true
    })
    return rows
  }

  function sumDays(rows) {
    var t = { cost: 0, inp: 0, out: 0, cr: 0, cw: 0, turns: 0, active: 0, prompts: 0, req: 0, tools: 0, toolErr: 0, add: 0, del: 0, commits: 0 }
    rows.forEach(function (r) { r.days.forEach(function (d) { for (var k in t) t[k] += d[DAY[k]] || 0 }) })
    return t
  }

  function mapSum(rows, key, valueAt, dict) {
    var out = {}
    rows.forEach(function (r) {
      if (!r.m) return
      ;(r.m[key] || []).forEach(function (e) {
        var name = dict ? dict[e[0]] : e[0]
        var cur = out[name] || (out[name] = [])
        for (var j = 1; j < e.length; j++) cur[j - 1] = (cur[j - 1] || 0) + e[j]
      })
    })
    return Object.keys(out).map(function (k) { return { name: code(k), v: out[k] } }).sort(function (a, b) { return (valueAt ? valueAt(b.v) - valueAt(a.v) : b.v[0] - a.v[0]) })
  }

  // ------------------------------------------------------------ controlli dei filtri

  /** L'etichetta di una categoria; la voce delle sessioni senza categoria si traduce come un codice. */
  function categoryName(i) { return D.categories[i] === '(nessuna)' ? code('(nessuna)') : D.categories[i] }

  function multi(label, key, dict, options, labelOf) {
    var name = labelOf || function (i) { return dict[i] }
    var box = el('details', { class: 'multi' })
    var summary = el('summary')
    var menu = el('div', { class: 'menu' })
    function refresh() { summary.textContent = label + ': ' + (state[key].length === 0 ? t('tutti') : state[key].length === 1 ? name(state[key][0]) : t('{n} scelti', { n: state[key].length })) }
    options.forEach(function (i) {
      var cb = el('input', { type: 'checkbox', value: String(i) })
      cb.checked = state[key].indexOf(i) >= 0
      cb.addEventListener('change', function () {
        if (cb.checked) state[key].push(i); else state[key] = state[key].filter(function (x) { return x !== i })
        refresh(); render()
      })
      menu.appendChild(el('label', {}, [cb, name(i) || t('(vuoto)')]))
    })
    box.appendChild(summary); box.appendChild(menu)
    refresh()
    return box
  }

  function buildFilters() {
    var nav = document.getElementById('kpi-filters')
    nav.textContent = ''
    var preset = el('select', { id: 'f-preset', 'aria-label': t('Periodo') })
    ;[['tutto', t('Tutto lo storico')], ['oggi', t('Oggi')], ['7', t('Ultimi 7 giorni')], ['30', t('Ultimi 30 giorni')], ['90', t('Ultimi 90 giorni')], ['personalizzato', t('Personalizzato…')]].forEach(function (o) {
      var opt = el('option', { value: o[0], text: o[1] }); if (state.preset === o[0]) opt.selected = true; preset.appendChild(opt)
    })
    var from = el('input', { type: 'date', value: state.from, 'aria-label': t('Dal') })
    var to = el('input', { type: 'date', value: state.to, 'aria-label': t('Al') })
    var custom = el('span', { class: 'group' }, [from, el('span', { class: 'hint', text: '→' }), to])
    custom.hidden = state.preset !== 'personalizzato'
    preset.addEventListener('change', function () { state.preset = preset.value; custom.hidden = state.preset !== 'personalizzato'; render() })
    from.addEventListener('change', function () { state.from = from.value || firstDay; render() })
    to.addEventListener('change', function () { state.to = to.value || today; render() })
    nav.appendChild(el('span', { class: 'group' }, [el('label', { for: 'f-preset', text: t('Periodo') }), preset, custom]))

    var used = function (field, dict) { var set = {}; DATA.sessions.forEach(function (s) { var v = s[field]; (Array.isArray(v) ? v : [v]).forEach(function (x) { if (x >= 0) set[x] = true }) }); return Object.keys(set).map(Number).sort(function (a, b) { return String(dict[a]).localeCompare(String(dict[b])) }) }
    nav.appendChild(multi(t('Progetto'), 'projects', D.projects, used(S.project, D.projects)))
    nav.appendChild(multi(t('Tipo'), 'kinds', D.kinds, used(S.kind, D.kinds), function (i) { return code(D.kinds[i]) }))
    nav.appendChild(multi(t('Modello'), 'models', D.models, used(S.models, D.models)))
    if (D.branches.length) nav.appendChild(multi('Branch', 'branches', D.branches, used(S.branches, D.branches)))
    if (D.repos.length) nav.appendChild(multi('Repo', 'repos', D.repos, used(S.repo, D.repos)))
    if (DATA.meta.category) nav.appendChild(multi(DATA.meta.category, 'categories', D.categories, used(S.category, D.categories), categoryName))
    var q = el('input', { type: 'search', class: 'search', placeholder: t('Cerca id o progetto'), 'aria-label': t('Cerca'), value: state.q })
    q.addEventListener('input', function () { state.q = q.value.trim(); render() })
    nav.appendChild(q)
    nav.appendChild(el('button', { type: 'button', text: t('Azzera filtri'), onclick: function () {
      state.preset = 'tutto'; state.projects = []; state.kinds = []; state.models = []; state.branches = []; state.repos = []; state.categories = []; state.q = ''; state.selected = null
      buildFilters(); render()
    } }))
  }

  // ------------------------------------------------------------ card e grafici

  function card(title, subtitle, legend, draw, tableRows, wide) {
    var parent = document.getElementById('kpi-charts')
    var box = el('article', { class: 'card' + (wide ? ' wide' : '') })
    var tableBox = el('div', { class: 'data-table' })
    tableBox.hidden = true
    var toggle = el('button', { type: 'button', text: t('Tabella'), 'aria-expanded': 'false' })
    toggle.addEventListener('click', function () {
      tableBox.hidden = !tableBox.hidden
      toggle.setAttribute('aria-expanded', String(!tableBox.hidden))
      toggle.textContent = tableBox.hidden ? t('Tabella') : t('Grafico')
      chart.hidden = !tableBox.hidden
    })
    box.appendChild(el('div', { class: 'card-head' }, [el('div', {}, [el('h2', { text: title }), subtitle ? el('p', { class: 'hint', text: subtitle }) : null]), tableRows ? toggle : null]))
    if (legend && legend.length > 1) {
      box.appendChild(el('div', { class: 'legend' }, legend.map(function (l) { var i = el('i'); i.style.background = l.color; return el('span', {}, [i, l.name]) })))
    }
    var chart = el('div', { class: 'chart' })
    box.appendChild(chart)
    if (tableRows) {
      tableBox.appendChild(simpleTable(tableRows.head, tableRows.rows, tableRows.num || []))
      box.appendChild(tableBox)
    }
    parent.appendChild(box)
    draw(chart)
    return box
  }

  function simpleTable(head, rows, num) {
    var tbl = el('table')
    tbl.appendChild(el('thead', {}, [el('tr', {}, head.map(function (h, i) { return el('th', { class: num.indexOf(i) >= 0 ? 'num' : '', text: h }) }))]))
    tbl.appendChild(el('tbody', {}, rows.map(function (r) { return el('tr', {}, r.map(function (c, i) { return el('td', { class: num.indexOf(i) >= 0 ? 'num' : '', text: String(c) }) })) })))
    return tbl
  }

  function empty(node, text) { node.appendChild(el('p', { class: 'empty', text: text || t('Nessun dato nel periodo') })) }

  /** La larghezza reale del contenitore: l'SVG si disegna 1:1, così i testi restano leggibili. */
  function widthOf(node) { var w = node.clientWidth || (node.parentNode && node.parentNode.clientWidth) || 640; return Math.max(300, Math.round(w)) }

  function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))); var n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p }

  /** Colonne nel tempo: serie impilate (positive) e opzionalmente una serie negativa (divergente). */
  function columns(node, labels, series, fmt, negative) {
    if (labels.length === 0) return empty(node)
    var W = widthOf(node), H = 220, L = 52, R = 8, T = 10, B = 26
    var pos = labels.map(function (_, i) { return series.reduce(function (a, s) { return a + (s.values[i] || 0) }, 0) })
    var neg = negative ? negative.values : null
    var maxPos = niceMax(Math.max.apply(null, pos.concat([0])))
    var maxNeg = neg ? niceMax(Math.max.apply(null, neg.concat([0]))) : 0
    var plotH = H - T - B
    var zero = T + (neg ? plotH * maxPos / (maxPos + maxNeg) : plotH)
    var scaleP = (zero - T) / maxPos
    var scaleN = neg ? (T + plotH - zero) / maxNeg : 0
    var band = (W - L - R) / labels.length
    var bw = Math.max(2, Math.min(24, band - 2))
    var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': t('Grafico a colonne') })
    ;[0, 0.5, 1].forEach(function (f) {
      var y = zero - f * maxPos * scaleP
      g.appendChild(svg('line', { x1: L, x2: W - R, y1: y, y2: y, class: f === 0 ? 'baseline' : 'gridline' }))
      g.appendChild(svg('text', { x: L - 6, y: y + 4, 'text-anchor': 'end', class: 'tick', text: fmt(f * maxPos) }))
    })
    if (neg) {
      var yn = zero + maxNeg * scaleN
      g.appendChild(svg('line', { x1: L, x2: W - R, y1: yn, y2: yn, class: 'gridline' }))
      g.appendChild(svg('text', { x: L - 6, y: yn + 4, 'text-anchor': 'end', class: 'tick', text: '−' + fmt(maxNeg) }))
    }
    var every = Math.max(1, Math.ceil(labels.length / 8))
    labels.forEach(function (label, i) {
      var x = L + i * band + (band - bw) / 2
      var y = zero
      series.forEach(function (s, si) {
        var v = s.values[i] || 0
        if (v <= 0) return
        var h = v * scaleP
        var isTop = series.slice(si + 1).every(function (n) { return !(n.values[i] > 0) })
        var gap = si > 0 ? 2 : 0
        g.appendChild(bar(x, y - h, bw, Math.max(0.5, h - gap), s.color, isTop ? 'top' : 'none'))
        y -= h
      })
      if (neg && neg[i] > 0) g.appendChild(bar(x, zero, bw, neg[i] * scaleN, negative.color, 'bottom'))
      var hit = svg('rect', { x: L + i * band, y: T, width: band, height: plotH, fill: 'transparent', tabindex: '0' })
      var rows = series.map(function (s) { return { color: s.color, value: fmt(s.values[i] || 0), label: s.name } })
      if (neg) rows.push({ color: negative.color, value: fmt(neg[i] || 0), label: negative.name })
      hit.addEventListener('pointermove', function (e) { showTip(e, label, rows) })
      hit.addEventListener('focus', function (e) { var b = hit.getBoundingClientRect(); showTip({ clientX: b.left + b.width / 2, clientY: b.top + 20 }, label, rows) })
      hit.addEventListener('pointerleave', hideTip)
      hit.addEventListener('blur', hideTip)
      g.appendChild(hit)
      if (i % every === 0) g.appendChild(svg('text', { x: L + i * band + band / 2, y: H - 8, 'text-anchor': 'middle', class: 'tick', text: label }))
    })
    node.appendChild(g)
  }

  /** Barra con estremo dati arrotondato (4px) e base squadrata. */
  function bar(x, y, w, h, color, round) {
    var r = Math.min(4, w / 2, h)
    if (round === 'none' || r <= 0) return svg('rect', { x: x, y: y, width: w, height: h, fill: color, class: 'mark' })
    var d = round === 'top'
      ? 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z'
      : 'M' + x + ',' + y + 'V' + (y + h - r) + 'Q' + x + ',' + (y + h) + ' ' + (x + r) + ',' + (y + h) + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + (y + h) + ' ' + (x + w) + ',' + (y + h - r) + 'V' + y + 'Z'
    return svg('path', { d: d, fill: color, class: 'mark' })
  }

  /** Barre orizzontali con etichetta a sinistra e valore in punta. */
  function hbars(node, items, fmt, color, detail) {
    if (items.length === 0) return empty(node)
    items = items.filter(function (i) { return i.value > 0 })
    if (items.length === 0) return empty(node)
    var W = widthOf(node), rowH = 26, L = Math.min(170, Math.round(W * 0.34)), R = 70, H = items.length * rowH + 4
    var max = Math.max.apply(null, items.map(function (i) { return i.value }).concat([1]))
    var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': t('Grafico a barre') })
    items.forEach(function (it, i) {
      var y = i * rowH + 4
      var w = Math.max(1, (it.value / max) * (W - L - R))
      var maxChars = Math.max(8, Math.floor((L - 12) / 6.2))
      g.appendChild(svg('text', { x: L - 8, y: y + 15, 'text-anchor': 'end', class: 'label-text', text: it.label.length > maxChars ? it.label.slice(0, maxChars - 1) + '…' : it.label }))
      var p = svg('path', { d: 'M' + L + ',' + (y + 4) + 'H' + (L + w - 4) + 'Q' + (L + w) + ',' + (y + 4) + ' ' + (L + w) + ',' + (y + 8) + 'V' + (y + 16) + 'Q' + (L + w) + ',' + (y + 20) + ' ' + (L + w - 4) + ',' + (y + 20) + 'H' + L + 'Z', fill: color, class: 'mark' })
      g.appendChild(p)
      g.appendChild(svg('text', { x: L + w + 6, y: y + 15, class: 'value-text', text: fmt(it.value) }))
      var hit = svg('rect', { x: 0, y: y, width: W, height: rowH, fill: 'transparent', tabindex: '0' })
      var rows = [{ color: color, value: fmt(it.value), label: it.label }].concat(detail ? detail(it) : [])
      hit.addEventListener('pointermove', function (e) { showTip(e, it.label, rows) })
      hit.addEventListener('pointerleave', hideTip)
      hit.addEventListener('focus', function () { var b = hit.getBoundingClientRect(); showTip({ clientX: b.left + 200, clientY: b.top }, it.label, rows) })
      hit.addEventListener('blur', hideTip)
      g.appendChild(hit)
    })
    node.appendChild(g)
  }

  /** Heatmap ora × giorno della settimana (rampa sequenziale a un solo colore). */
  function heatmap(node, cells) {
    var max = Math.max.apply(null, cells.concat([0]))
    if (max === 0) return empty(node)
    var W = widthOf(node), L = 36, T = 16, cw = (W - L - 4) / 24, ch = 22, H = T + 7 * ch + 4
    var days = loc().weekdays
    var ramp = ['--seq-1', '--seq-2', '--seq-3', '--seq-4', '--seq-5', '--seq-6', '--seq-7'].map(css)
    var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': t('Attività per ora e giorno') })
    for (var h = 0; h < 24; h += 3) g.appendChild(svg('text', { x: L + h * cw + cw / 2, y: 11, 'text-anchor': 'middle', class: 'tick', text: String(h) }))
    days.forEach(function (d, wd) {
      g.appendChild(svg('text', { x: L - 6, y: T + wd * ch + 15, 'text-anchor': 'end', class: 'tick', text: d }))
      for (var hh = 0; hh < 24; hh++) {
        (function (hour) {
          var v = cells[wd * 24 + hour] || 0
          var fill = v === 0 ? css('--grid') : ramp[Math.min(6, Math.floor((v / max) * 6.999))]
          var r = svg('rect', { x: L + hour * cw + 1, y: T + wd * ch + 1, width: cw - 2, height: ch - 2, rx: 3, fill: fill, class: 'mark', tabindex: '0' })
          var label = d + ' ' + two(hour) + ':00'
          var rows = [{ value: int(v), label: v === 1 ? t('turno') : t('turni') }]
          r.addEventListener('pointermove', function (e) { showTip(e, label, rows) })
          r.addEventListener('pointerleave', hideTip)
          g.appendChild(r)
        })(hh)
      }
    })
    node.appendChild(g)
  }

  // ------------------------------------------------------------ rendering

  /** I testi fissi della pagina nella lingua scelta. */
  function applyStatic() {
    document.documentElement.lang = lang
    document.getElementById('kpi-title').textContent = t('KPI di Claude Code')
    document.getElementById('kpi-lang-label').textContent = t('Lingua')
    document.getElementById('kpi-theme-label').textContent = t('Tema')
    var opts = document.getElementById('kpi-theme').options
    opts[0].textContent = t('Automatico'); opts[1].textContent = t('Chiaro'); opts[2].textContent = t('Scuro')
    document.getElementById('kpi-filters').setAttribute('aria-label', t('Filtri'))
    document.getElementById('kpi-tiles').setAttribute('aria-label', t('Indicatori principali'))
    var desc = DATA.meta.description
    document.title = 'KPI Claude Code · ' + (typeof desc === 'string' ? desc : desc[lang] || desc.it)
    renderFolders()
  }

  function description() { var desc = DATA.meta.description; return typeof desc === 'string' ? desc : desc[lang] || desc.it }

  /** Copia `text` negli appunti e lo dice sul pulsante per un attimo. */
  function copyText(text, button) {
    var label = button.textContent
    var done = function () { button.textContent = t('Copiato'); setTimeout(function () { button.textContent = label }, 1500) }
    var fallback = function () {
      var area = el('textarea', { readonly: 'readonly' })
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      try { if (document.execCommand('copy')) done() } catch (e) { /* niente appunti: resta il percorso a schermo */ }
      document.body.removeChild(area)
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback)
    else fallback()
  }

  /**
   * Le cartelle di report ed export. La pagina, aperta da `file://`, non può
   * avviare il file manager: "Apri" mostra la cartella nel browser (quando il
   * browser la può leggere), e il comando copiato la apre da Claude Code.
   */
  function renderFolders() {
    var box = document.getElementById('kpi-folders')
    var folders = DATA.meta.folders
    box.textContent = ''
    box.hidden = !folders
    if (!folders) return
    var rows = [[t('Cartella dei report'), folders.report]]
    if (folders.export && folders.export.path !== folders.report.path) rows.push([t('Cartella degli export'), folders.export])
    rows.forEach(function (row) {
      var f = row[1]
      var copyPath = el('button', { type: 'button', text: t('Copia percorso') })
      var copyCommand = el('button', { type: 'button', text: t('Copia comando'), title: t('Incollalo in Claude Code: apre la cartella nel file manager') })
      copyPath.addEventListener('click', function () { copyText(f.path, copyPath) })
      copyCommand.addEventListener('click', function () { copyText(f.command[lang] || f.command.it, copyCommand) })
      box.appendChild(el('p', { class: 'folder' }, [
        row[0] + ':',
        el('code', { text: f.path }),
        el('a', { href: f.url, target: '_blank', rel: 'noopener', text: t('Apri'), title: t('Apre la cartella nel browser; il file manager si apre con il comando copiato') }),
        copyPath,
        copyCommand,
      ]))
    })
  }

  function render() {
    var rows = filtered()
    var tt = sumDays(rows)
    var r = rangeDays()
    document.getElementById('kpi-sub').textContent = t('Generato il {date} · {description} · {n} sessioni nel filtro', { date: dateTime(DATA.meta.generatedAt), description: description(), n: int(rows.length) })
    var notice = document.getElementById('kpi-notice')
    notice.hidden = !DATA.meta.trimmed
    notice.textContent = DATA.meta.trimmed ? t('Per stare nel limite di dimensione, le distribuzioni (tool, modelli, comandi…) delle sessioni più vecchie non sono incluse; totali e andamenti giornalieri sono completi. Rigenera con un periodo più corto per averle tutte.') : ''

    // Riquadri
    var tiles = document.getElementById('kpi-tiles')
    tiles.textContent = ''
    var inputTok = tt.inp + tt.cr + tt.cw
    var sum = function (f) { return rows.reduce(function (a, x) { return a + (x.s[f] || 0) }, 0) }
    var testsOk = sum(S.testsOk), testsKo = sum(S.testsKo)
    var tileData = [
      ['hero', t('Costo'), usd(tt.cost), tt.turns > 0 ? t('{cost} per turno', { cost: usd(tt.cost / tt.turns) }) : ''],
      ['', t('Sessioni'), int(rows.length), tn(new Set(rows.map(function (x) { return x.s[S.project] })).size, '{n} progetto', '{n} progetti')],
      ['', t('Turni'), int(tt.turns), tn(tt.prompts, '{n} prompt', '{n} prompt', '{n} prompt')],
      ['', t('Tempo attivo'), dur(tt.active), tt.turns > 0 ? t('{time} per turno', { time: dur(tt.active / tt.turns) }) : ''],
      ['', t('Token totali'), compact(inputTok + tt.out), 'in ' + compact(inputTok) + ' · out ' + compact(tt.out)],
      ['', 'Cache hit', inputTok > 0 ? pct(tt.cr / inputTok) : '–', t('letti {n}', { n: compact(tt.cr) })],
      ['', t('Tool call'), int(tt.tools), tt.tools > 0 ? t('{pct} in errore', { pct: pct(tt.toolErr / tt.tools) }) : ''],
      ['', t('Righe'), '+' + int(tt.add) + ' −' + int(tt.del), t('nette {n}', { n: int(tt.add - tt.del) })],
      ['', t('Commit'), int(tt.commits), int(sum(S.prs)) + ' PR · ' + int(sum(S.pushes)) + ' push'],
      ['', t('Test'), testsOk + testsKo > 0 ? pct(testsOk / (testsOk + testsKo)) : '–', t('{ok} superati · {ko} falliti', { ok: int(testsOk), ko: int(testsKo) })],
      ['', 'Subagent', int(sum(S.agents)), tn(sum(S.compactions), '{n} compattazione', '{n} compattazioni')],
    ]
    tileData.forEach(function (d) { tiles.appendChild(el('div', { class: 'tile ' + d[0] }, [el('div', { class: 'label', text: d[1] }), el('div', { class: 'value', text: d[2] }), d[3] ? el('div', { class: 'detail', text: d[3] }) : null])) })

    // Serie giornaliere (giorni continui nel periodo)
    var byDay = {}
    rows.forEach(function (x) { x.days.forEach(function (d) { var k = d[DAY.day]; var a = byDay[k] || (byDay[k] = {}); for (var f in DAY) if (f !== 's' && f !== 'day') a[f] = (a[f] || 0) + d[DAY[f]] }) })
    var keys = Object.keys(byDay).sort()
    var start = r[0] || keys[0], end = r[1] || keys[keys.length - 1]
    var span = []
    if (start && end) for (var dd = start, guard = 0; dd <= end && guard < 3660; dd = addDays(dd, 1), guard++) span.push(dd)
    var val = function (f) { return span.map(function (k) { return byDay[k] ? byDay[k][f] || 0 : 0 }) }
    var labels = span.map(dayLabel)
    var C = { s1: css('--series-1'), s2: css('--series-2'), s3: css('--series-3'), s4: css('--series-4'), s8: css('--series-8') }
    var dayTable = function (cols) { return { head: [t('Giorno')].concat(cols.map(function (c) { return c[0] })), rows: span.map(function (k, i) { return [dayLabel(k)].concat(cols.map(function (c) { return c[2](c[1][i]) })) }), num: cols.map(function (_, i) { return i + 1 }) } }

    var charts = document.getElementById('kpi-charts')
    charts.textContent = ''
    var cost = val('cost')
    card(t('Costo per giorno'), t('USD calcolati da Claude Code'), null, function (n) { columns(n, labels, [{ name: t('Costo'), color: C.s1, values: cost }], usd) }, dayTable([[t('Costo'), cost, usd]]))
    var tin = val('inp'), tcr = val('cr'), tcw = val('cw'), tout = val('out')
    var tokSeries = [{ name: 'Input', color: C.s1, values: tin }, { name: t('Cache letta'), color: C.s2, values: tcr }, { name: t('Cache scritta'), color: C.s3, values: tcw }, { name: 'Output', color: C.s4, values: tout }]
    card(t('Token per giorno'), t('Impilati per tipo'), tokSeries, function (n) { columns(n, labels, tokSeries, compact) }, dayTable([['Input', tin, int], [t('Cache letta'), tcr, int], [t('Cache scritta'), tcw, int], ['Output', tout, int]]))
    var adds = val('add'), dels = val('del')
    card(t('Righe di codice per giorno'), t('Aggiunte sopra lo zero, rimosse sotto'), [{ name: t('Aggiunte'), color: C.s1 }, { name: t('Rimosse'), color: C.s8 }], function (n) { columns(n, labels, [{ name: t('Aggiunte'), color: C.s1, values: adds }], int, { name: t('Rimosse'), color: C.s8, values: dels }) }, dayTable([[t('Aggiunte'), adds, int], [t('Rimosse'), dels, int]]))
    var turns = val('turns'), commits = val('commits')
    card(t('Turni per giorno'), null, null, function (n) { columns(n, labels, [{ name: t('Turni'), color: C.s1, values: turns }], int) }, dayTable([[t('Turni'), turns, int], [t('Tempo attivo'), val('active'), dur], ['Prompt', val('prompts'), int]]))
    card(t('Commit per giorno'), null, null, function (n) { columns(n, labels, [{ name: t('Commit'), color: C.s1, values: commits }], int) }, dayTable([[t('Commit'), commits, int]]))

    // Heatmap
    var cells = new Array(168).fill(0)
    rows.forEach(function (x) { if (x.m) (x.m.h || []).forEach(function (p) { cells[p[0]] += p[1] }) })
    card(t('Attività per ora e giorno'), t('Turni per fascia oraria (ora locale)'), null, function (n) { heatmap(n, cells) }, { head: [t('Giorno')].concat(Array.from({ length: 24 }, function (_, h) { return two(h) })), rows: loc().weekdays.map(function (d, wd) { return [d].concat(cells.slice(wd * 24, wd * 24 + 24)) }), num: Array.from({ length: 24 }, function (_, h) { return h + 1 }) })

    // Distribuzioni
    var tools = mapSum(rows, 't', null, D.tools).slice(0, 12)
    card(t('Tool più usati'), t('Chiamate; nel tooltip errori e durata media'), null, function (n) {
      hbars(n, tools.map(function (x) { return { label: x.name, value: x.v[0], err: x.v[1], ms: x.v[3] ? x.v[2] / x.v[3] : 0 } }), int, C.s1, function (it) { return [{ value: int(it.err), label: t('errori') }, { value: it.ms ? dur(it.ms) : '–', label: t('durata media') }] })
    }, { head: ['Tool', t('Chiamate'), t('Errori'), t('Durata media')], rows: tools.map(function (x) { return [x.name, int(x.v[0]), int(x.v[1]), x.v[3] ? dur(x.v[2] / x.v[3]) : '–'] }), num: [1, 2, 3] })
    var cats = mapSum(rows, 'c', null, D.cats)
    card(t('Bash per categoria'), t('Comandi; nel tooltip esiti'), null, function (n) {
      hbars(n, cats.map(function (x) { return { label: x.name, value: x.v[0], ok: x.v[1], err: x.v[2] } }), int, C.s1, function (it) { return [{ value: int(it.ok), label: 'ok' }, { value: int(it.err), label: t('errori') }] })
    }, { head: [t('Categoria'), t('Comandi'), 'Ok', t('Errori')], rows: cats.map(function (x) { return [x.name, int(x.v[0]), int(x.v[1]), int(x.v[2])] }), num: [1, 2, 3] })
    var models = mapSum(rows, 'm', function (v) { return v[1] + v[2] + v[3] + v[4] }, D.models)
    card(t('Token per modello'), t('Input + output + cache'), null, function (n) {
      hbars(n, models.map(function (x) { return { label: x.name, value: x.v[1] + x.v[2] + x.v[3] + x.v[4], req: x.v[0] } }), compact, C.s1, function (it) { return [{ value: int(it.req), label: t('richieste') }] })
    }, { head: [t('Modello'), t('Richieste'), 'Input', 'Output', t('Cache letta'), t('Cache scritta')], rows: models.map(function (x) { return [x.name, int(x.v[0]), int(x.v[1]), int(x.v[2]), int(x.v[3]), int(x.v[4])] }), num: [1, 2, 3, 4, 5] })
    var cmds = mapSum(rows, 'b', null, D.cmds).slice(0, 12)
    card(t('Comandi Bash più usati'), t('Solo programma e sottocomando'), null, function (n) { hbars(n, cmds.map(function (x) { return { label: x.name, value: x.v[0] } }), int, C.s1) }, { head: [t('Comando'), t('Volte'), 'Ok', t('Errori')], rows: cmds.map(function (x) { return [x.name, int(x.v[0]), int(x.v[1]), int(x.v[2])] }), num: [1, 2, 3] })
    var docs = mapSum(rows, 'u', function (v) { return v[0] + v[1] }, D.exts)
    if (docs.length) card(t('Documenti creati'), t('Per estensione, dai comandi Bash (git status del repo)'), null, function (n) { hbars(n, docs.map(function (x) { return { label: x.name, value: x.v[0] + x.v[1], created: x.v[0], regen: x.v[1] } }), int, C.s1, function (it) { return [{ value: int(it.created), label: t('Creati') }, { value: int(it.regen), label: t('Rigenerati') }] }) }, { head: [t('Estensione'), t('Creati'), t('Rigenerati')], rows: docs.map(function (x) { return [x.name, int(x.v[0]), int(x.v[1])] }), num: [1, 2] })
    var exts = mapSum(rows, 'x', function (v) { return v[1] + v[2] }, D.exts).slice(0, 12)
    card(t('Righe per estensione'), t('Aggiunte + rimosse'), null, function (n) { hbars(n, exts.map(function (x) { return { label: x.name, value: x.v[1] + x.v[2], add: x.v[1], del: x.v[2] } }), int, C.s1, function (it) { return [{ value: '+' + int(it.add), label: t('aggiunte') }, { value: '−' + int(it.del), label: t('rimosse') }] }) }, { head: [t('Estensione'), t('Modifiche'), t('Aggiunte'), t('Rimosse')], rows: exts.map(function (x) { return [x.name, int(x.v[0]), int(x.v[1]), int(x.v[2])] }), num: [1, 2, 3] })

    // Istogramma durata turni
    var hist = {}
    rows.forEach(function (x) { if (x.m && x.m.d) for (var b in x.m.d) hist[b] = (hist[b] || 0) + x.m.d[b] })
    var bins = [[0, 10e3, '<10s'], [10e3, 30e3, '10–30s'], [30e3, 60e3, '30s–1m'], [60e3, 180e3, '1–3m'], [180e3, 600e3, '3–10m'], [600e3, 1800e3, '10–30m'], [1800e3, Infinity, '>30m']]
    var histVals = bins.map(function (bin) { var c = 0; for (var b in hist) { var mid = +b <= 0 ? 0.5 : Math.pow(2, (+b - 0.5) / 4); if (mid >= bin[0] && mid < bin[1]) c += hist[b] } return c })
    card(t('Durata dei turni'), t('Numero di turni per fascia di durata'), null, function (n) { columns(n, bins.map(function (b) { return b[2] }), [{ name: t('Turni'), color: C.s1, values: histVals }], int) }, { head: [t('Fascia'), t('Turni')], rows: bins.map(function (b, i) { return [b[2], int(histVals[i])] }), num: [1] })

    var agents = mapSum(rows, 'a', null, D.agents)
    card(t('Subagent per tipo'), t('Avvii; nel tooltip durata e token'), null, function (n) { hbars(n, agents.map(function (x) { return { label: x.name, value: x.v[0], ms: x.v[1], tok: x.v[2] } }), int, C.s1, function (it) { return [{ value: dur(it.ms), label: t('durata totale') }, { value: compact(it.tok), label: t('token') }] }) }, { head: [t('Tipo'), t('Avvii'), t('Durata'), 'Token', 'Tool', t('Errori')], rows: agents.map(function (x) { return [x.name, int(x.v[0]), dur(x.v[1]), compact(x.v[2]), int(x.v[3]), int(x.v[4])] }), num: [1, 2, 3, 4, 5] })
    var skills = mapSum(rows, 's', null, D.skills).slice(0, 10)
    card('Skill', null, null, function (n) { hbars(n, skills.map(function (x) { return { label: x.name, value: x.v[0] } }), int, C.s1) }, { head: ['Skill', t('Invocazioni')], rows: skills.map(function (x) { return [x.name, int(x.v[0])] }), num: [1] })
    var commands = mapSum(rows, 'o', null, D.commands).slice(0, 10)
    card(t('Comandi slash'), null, null, function (n) { hbars(n, commands.map(function (x) { return { label: '/' + x.name, value: x.v[0] } }), int, C.s1) }, { head: [t('Comando'), t('Volte')], rows: commands.map(function (x) { return ['/' + x.name, int(x.v[0])] }), num: [1] })
    var mcp = mapSum(rows, 'p', null, D.mcp)
    if (mcp.length) card(t('Server MCP'), null, null, function (n) { hbars(n, mcp.map(function (x) { return { label: x.name, value: x.v[0], err: x.v[1] } }), int, C.s1, function (it) { return [{ value: int(it.err), label: t('errori') }] }) }, { head: ['Server', t('Chiamate'), t('Errori')], rows: mcp.map(function (x) { return [x.name, int(x.v[0]), int(x.v[1])] }), num: [1, 2] })

    // Permessi, errori, stop: tabelle compatte
    var perms = [[t('Consentiti'), sum(S.allow)], [t('Chiesti'), sum(S.ask)], [t('Negate da regola, modalità o hook'), sum(S.deny)], [t("Rifiutate dall'utente"), sum(S.rejected)], [t('Negate dal classificatore'), sum(S.clsDenied)], [t('Dialoghi mostrati'), sum(S.dialogs)]]
    card(t('Permessi'), null, null, function (n) { hbars(n, perms.map(function (p) { return { label: p[0], value: p[1] } }), int, C.s1) }, { head: [t('Decisione'), t('Volte')], rows: perms.map(function (p) { return [p[0], int(p[1])] }), num: [1] })
    var errs = mapSum(rows, 'e', null, D.errors).map(function (x) { return [x.name, x.v[0]] }).concat([[t('turni in errore'), sum(S.turnErr)], [t('interruzioni'), sum(S.interrupts)], [t('rifiuti'), sum(S.refusals)]]).filter(function (x) { return x[1] > 0 })
    card(t('Errori e interruzioni'), null, null, function (n) { hbars(n, errs.map(function (p) { return { label: p[0], value: p[1] } }), int, C.s8) }, { head: [t('Tipo'), t('Volte')], rows: errs.map(function (p) { return [p[0], int(p[1])] }), num: [1] })
    var stops = mapSum(rows, 'r', null, D.stops)
    card(t('Motivi di stop delle richieste'), null, null, function (n) { hbars(n, stops.map(function (x) { return { label: x.name, value: x.v[0] } }), int, C.s1) }, { head: [t('Motivo'), t('Richieste')], rows: stops.map(function (x) { return [x.name, int(x.v[0])] }), num: [1] })

    renderSessions(rows)
    renderProjects(rows)
    document.getElementById('kpi-foot').textContent = t('kpi-tracker · dati registrati localmente da Claude Code · il costo è quello calcolato da Claude Code (equivalente API) · nessun testo di prompt o risposte è incluso.')
  }

  // ------------------------------------------------------------ tabelle

  function sessionValues(x) {
    var tt = sumDays([x])
    return {
      start: x.s[S.start], project: D.projects[x.s[S.project]], id: x.s[S.id].slice(0, 8), kind: code(D.kinds[x.s[S.kind]]), dur: Math.max(0, x.s[S.last] - x.s[S.start]),
      turns: tt.turns, active: tt.active, cost: tt.cost, tokens: tt.inp + tt.out + tt.cr + tt.cw, tools: tt.tools, add: tt.add, del: tt.del, commits: tt.commits,
      branch: (x.s[S.branches].map(function (b) { return D.branches[b] }).slice(-1)[0]) || '–', status: x.s[S.status], t: tt,
      category: x.s[S.category] >= 0 ? categoryName(x.s[S.category]) : '',
    }
  }

  function sortable(container, cols, data, sortKey, onRow) {
    var wrap = el('div', { class: 'table-wrap' })
    var table = el('table')
    var thead = el('thead')
    var tr = el('tr')
    cols.forEach(function (c) {
      var th = el('th', { class: c.num ? 'num' : '', text: c.label, scope: 'col', tabindex: '0' })
      if (state[sortKey].key === c.key) th.setAttribute('aria-sort', state[sortKey].dir > 0 ? 'ascending' : 'descending')
      var go = function () { state[sortKey] = { key: c.key, dir: state[sortKey].key === c.key ? -state[sortKey].dir : -1 }; render() }
      th.addEventListener('click', go)
      th.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go() } })
      tr.appendChild(th)
    })
    thead.appendChild(tr)
    table.appendChild(thead)
    var s = state[sortKey]
    data.sort(function (a, b) { var va = a.v[s.key], vb = b.v[s.key]; return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * s.dir })
    var tbody = el('tbody')
    data.forEach(function (d) {
      var row = el('tr', { class: onRow ? 'clickable' : '', tabindex: onRow ? '0' : null })
      cols.forEach(function (c) { var td = el('td', { class: (c.num ? 'num ' : '') + (c.cls ? c.cls(d.v) : ''), text: c.fmt ? c.fmt(d.v[c.key], d.v) : String(d.v[c.key]) }); row.appendChild(td) })
      if (onRow) { row.addEventListener('click', function () { onRow(d) }); row.addEventListener('keydown', function (e) { if (e.key === 'Enter') onRow(d) }) }
      tbody.appendChild(row)
    })
    table.appendChild(tbody)
    wrap.appendChild(table)
    container.appendChild(wrap)
  }

  state.psort = { key: 'cost', dir: -1 }

  function renderSessions(rows) {
    var box = document.getElementById('kpi-sessions')
    box.textContent = ''
    box.appendChild(el('div', { class: 'card-head' }, [el('div', {}, [el('h2', { text: t('Sessioni ({n})', { n: int(rows.length) }) }), el('p', { class: 'hint', text: t('Clic su una riga per il dettaglio · clic sulle intestazioni per ordinare') })])]))
    var data = rows.map(function (x) { return { x: x, v: sessionValues(x) } })
    sortable(box, [
      { key: 'start', label: t('Inizio'), fmt: dateTime },
      { key: 'project', label: t('Progetto') },
      { key: 'id', label: 'ID' },
      { key: 'kind', label: t('Tipo') },
      { key: 'dur', label: t('Durata'), num: true, fmt: dur },
      { key: 'turns', label: t('Turni'), num: true, fmt: int },
      { key: 'active', label: t('Attivo'), num: true, fmt: dur },
      { key: 'cost', label: t('Costo'), num: true, fmt: usd },
      { key: 'tokens', label: 'Token', num: true, fmt: compact },
      { key: 'tools', label: 'Tool', num: true, fmt: int },
      { key: 'add', label: t('Righe'), num: true, fmt: function (v, row) { return '+' + int(row.add) + ' −' + int(row.del) } },
      { key: 'commits', label: t('Commit'), num: true, fmt: int },
      { key: 'branch', label: 'Branch' },
    ].concat(DATA.meta.category ? [{ key: 'category', label: DATA.meta.category }] : [], [
      // Lo stato resta un codice per la classe CSS; si mostra tradotto.
      { key: 'status', label: t('Stato'), fmt: code, cls: function (v) { return 'status-' + v.status } },
    ]), data, 'sort', function (d) { state.selected = d.x.i; render() })
    var sel = rows.filter(function (x) { return x.i === state.selected })[0]
    if (sel) box.appendChild(detail(sel))
  }

  function detail(x) {
    var s = x.s, tt = sumDays([x])
    var items = [
      [t('Sessione'), s[S.id]], [t('Progetto'), D.projects[s[S.project]]], [t('Percorso'), D.paths[s[S.path]]], [t('Tipo · stato'), code(D.kinds[s[S.kind]]) + ' · ' + code(s[S.status])],
      [t('Inizio'), dateTime(s[S.start])], [t('Ultima attività'), dateTime(s[S.last])], [t('Segmenti'), int(s[S.segments])], [t('Versione'), s[S.version] || '–'],
      [t('Modelli'), s[S.models].map(function (m) { return D.models[m] }).join(', ') || '–'], ['Branch', s[S.branches].map(function (b) { return D.branches[b] }).join(', ') || '–'],
      [t('Costo'), usd(tt.cost)], [t('Costo fuori dai turni'), usd(s[S.costOut] || 0)], [t('Turni (subagent)'), int(tt.turns) + ' (' + int(s[S.subTurns]) + ')'], [t('Tempo attivo'), dur(tt.active)], [t('Prompt · richieste'), int(tt.prompts) + ' · ' + int(tt.req)],
      ['Token in · out', compact(tt.inp + tt.cr + tt.cw) + ' · ' + compact(tt.out)], ['Cache hit', tt.inp + tt.cr + tt.cw > 0 ? pct(tt.cr / (tt.inp + tt.cr + tt.cw)) : '–'],
      [t('TTFT mediano'), s[S.ttft] ? dur(s[S.ttft]) : '–'], [t('Contesto max'), int(s[S.ctxMax]) + '%'], [t('Rate limit 5h · 7g (max)'), (s[S.r5] >= 0 ? int(s[S.r5]) + '%' : '–') + ' · ' + (s[S.r7] >= 0 ? int(s[S.r7]) + '%' : '–')],
      [t('Compattazioni'), int(s[S.compactions])], [t('Tool (errori)'), int(tt.tools) + ' (' + int(tt.toolErr) + ')'], [t('Righe'), '+' + int(tt.add) + ' −' + int(tt.del)],
      [t('File creati · modificati · letti'), int(s[S.created]) + ' · ' + int(s[S.modified]) + ' · ' + int(s[S.read])], [t('Commit · push · PR'), int(tt.commits) + ' · ' + int(s[S.pushes]) + ' · ' + int(s[S.prs])],
      [t('Test ok · ko'), int(s[S.testsOk]) + ' · ' + int(s[S.testsKo])], [t('Build ok · ko'), int(s[S.buildsOk]) + ' · ' + int(s[S.buildsKo])], [t('Documenti creati · rigenerati'), int(s[S.docs] || 0) + ' · ' + int(s[S.docsRegen] || 0)], ['Subagent', int(s[S.agents])],
      [t('Permessi consentiti · chiesti · negati · rifiutati'), int(s[S.allow]) + ' · ' + int(s[S.ask]) + ' · ' + int(s[S.deny] + (s[S.clsDenied] || 0)) + ' · ' + int(s[S.rejected] || 0)], [t('Errori turno · interruzioni · rifiuti'), int(s[S.turnErr]) + ' · ' + int(s[S.interrupts]) + ' · ' + int(s[S.refusals])],
    ]
    // Dopo Branch: la categoria, se attiva.
    if (DATA.meta.category) items.splice(10, 0, [DATA.meta.category, s[S.category] >= 0 ? categoryName(s[S.category]) : '–'])
    var dl = el('dl')
    items.forEach(function (it) { dl.appendChild(el('div', {}, [el('dt', { text: it[0] }), el('dd', { text: String(it[1]) })])) })
    return el('div', { class: 'detail-panel' }, [el('h2', { text: t('Dettaglio sessione {id}', { id: s[S.id].slice(0, 8) }) }), dl])
  }

  function renderProjects(rows) {
    var box = document.getElementById('kpi-projects')
    box.textContent = ''
    var groups = {}
    rows.forEach(function (x) {
      var k = x.s[S.path]
      var g = groups[k] || (groups[k] = { name: D.projects[x.s[S.project]], path: D.paths[k], sessions: 0, last: 0, rows: [] })
      g.sessions++; g.last = Math.max(g.last, x.s[S.last]); g.rows.push(x)
    })
    var data = Object.keys(groups).map(function (k) {
      var g = groups[k], tt = sumDays(g.rows)
      return { v: { name: g.name, path: g.path, sessions: g.sessions, last: g.last, turns: tt.turns, active: tt.active, cost: tt.cost, tokens: tt.inp + tt.out + tt.cr + tt.cw, add: tt.add, del: tt.del, commits: tt.commits } }
    })
    box.appendChild(el('div', { class: 'card-head' }, [el('h2', { text: t('Progetti ({n})', { n: int(data.length) }) })]))
    sortable(box, [
      { key: 'name', label: t('Progetto') },
      { key: 'path', label: t('Percorso') },
      { key: 'sessions', label: t('Sessioni'), num: true, fmt: int },
      { key: 'last', label: t('Ultima attività'), fmt: dateTime },
      { key: 'turns', label: t('Turni'), num: true, fmt: int },
      { key: 'active', label: t('Attivo'), num: true, fmt: dur },
      { key: 'cost', label: t('Costo'), num: true, fmt: usd },
      { key: 'tokens', label: 'Token', num: true, fmt: compact },
      { key: 'add', label: t('Righe'), num: true, fmt: function (v, row) { return '+' + int(row.add) + ' −' + int(row.del) } },
      { key: 'commits', label: t('Commit'), num: true, fmt: int },
    ], data, 'psort', null)
  }

  // ------------------------------------------------------------ lingua e tema

  var langSelect = document.getElementById('kpi-lang')
  langSelect.value = lang
  langSelect.addEventListener('change', function () {
    lang = LOCALES[langSelect.value] ? langSelect.value : lang
    applyStatic(); buildFilters(); render()
  })

  var theme = document.getElementById('kpi-theme')
  theme.addEventListener('change', function () {
    if (theme.value === 'auto') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme.value)
    render()
  })
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)')
    if (mq.addEventListener) mq.addEventListener('change', function () { if (theme.value === 'auto') render() })
  }

  // `#chiaro` / `#scuro` nell'URL forzano il tema (utile anche per stampare o condividere).
  var hash = (window.location && window.location.hash || '').toLowerCase()
  if (hash === '#chiaro' || hash === '#light' || hash === '#scuro' || hash === '#dark') {
    theme.value = hash === '#chiaro' || hash === '#light' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', theme.value)
  }

  var resizeTimer = null
  window.addEventListener && window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 200) })

  applyStatic()
  buildFilters()
  render()
})()
