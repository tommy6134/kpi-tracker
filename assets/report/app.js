/* kpi-tracker · dashboard HTML offline. JS puro, nessuna dipendenza. */
(function () {
  'use strict'

  var DATA = JSON.parse(document.getElementById('kpi-data').textContent)
  var D = DATA.dict
  var SVGNS = 'http://www.w3.org/2000/svg'

  // Indici delle tuple (vedi hooks/report/html.ts).
  var S = { id: 0, project: 1, path: 2, kind: 3, start: 4, last: 5, status: 6, branches: 7, models: 8, repo: 9, segments: 10, ctxMax: 11, r5: 12, r7: 13, compactions: 14, agents: 15, pushes: 16, prs: 17, testsOk: 18, testsKo: 19, buildsOk: 20, buildsKo: 21, created: 22, modified: 23, read: 24, subTurns: 25, ttft: 26, allow: 27, ask: 28, deny: 29, dialogs: 30, turnErr: 31, interrupts: 32, refusals: 33, version: 34 }
  var DAY = { s: 0, day: 1, cost: 2, inp: 3, out: 4, cr: 5, cw: 6, turns: 7, active: 8, prompts: 9, req: 10, tools: 11, toolErr: 12, add: 13, del: 14, commits: 15 }

  // ------------------------------------------------------------ formattazione (italiano)

  function fixed(v, d) {
    if (!isFinite(v)) return '–'
    var neg = v < 0
    var parts = Math.abs(v).toFixed(d || 0).split('.')
    var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return (neg ? '−' : '') + whole + (parts[1] ? ',' + parts[1] : '')
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
    return h - g * 24 === 0 ? g + 'g' : g + 'g ' + (h - g * 24) + 'h'
  }
  function two(n) { return (n < 10 ? '0' : '') + n }
  function dayKey(ms) { var d = new Date(ms); return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) }
  function dayLabel(day) { var p = day.split('-'); return p[2] + '/' + p[1] }
  function dateTime(ms) { if (!ms) return '–'; var d = new Date(ms); return two(d.getDate()) + '/' + two(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()) }
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
  var state = { preset: 'tutto', from: firstDay, to: today, projects: [], kinds: [], models: [], branches: [], repos: [], q: '', sort: { key: 'start', dir: -1 }, selected: null }

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
    return Object.keys(out).map(function (k) { return { name: k, v: out[k] } }).sort(function (a, b) { return (valueAt ? valueAt(b.v) - valueAt(a.v) : b.v[0] - a.v[0]) })
  }

  // ------------------------------------------------------------ controlli dei filtri

  function multi(label, key, dict, options) {
    var box = el('details', { class: 'multi' })
    var summary = el('summary')
    var menu = el('div', { class: 'menu' })
    function refresh() { summary.textContent = label + ': ' + (state[key].length === 0 ? 'tutti' : state[key].length === 1 ? dict[state[key][0]] : state[key].length + ' scelti') }
    options.forEach(function (i) {
      var cb = el('input', { type: 'checkbox', value: String(i) })
      cb.checked = state[key].indexOf(i) >= 0
      cb.addEventListener('change', function () {
        if (cb.checked) state[key].push(i); else state[key] = state[key].filter(function (x) { return x !== i })
        refresh(); render()
      })
      menu.appendChild(el('label', {}, [cb, dict[i] || '(vuoto)']))
    })
    box.appendChild(summary); box.appendChild(menu)
    refresh()
    return box
  }

  function buildFilters() {
    var nav = document.getElementById('kpi-filters')
    nav.textContent = ''
    var preset = el('select', { id: 'f-preset', 'aria-label': 'Periodo' })
    ;[['tutto', 'Tutto lo storico'], ['oggi', 'Oggi'], ['7', 'Ultimi 7 giorni'], ['30', 'Ultimi 30 giorni'], ['90', 'Ultimi 90 giorni'], ['personalizzato', 'Personalizzato…']].forEach(function (o) {
      var opt = el('option', { value: o[0], text: o[1] }); if (state.preset === o[0]) opt.selected = true; preset.appendChild(opt)
    })
    var from = el('input', { type: 'date', value: state.from, 'aria-label': 'Dal' })
    var to = el('input', { type: 'date', value: state.to, 'aria-label': 'Al' })
    var custom = el('span', { class: 'group' }, [from, el('span', { class: 'hint', text: '→' }), to])
    custom.hidden = state.preset !== 'personalizzato'
    preset.addEventListener('change', function () { state.preset = preset.value; custom.hidden = state.preset !== 'personalizzato'; render() })
    from.addEventListener('change', function () { state.from = from.value || firstDay; render() })
    to.addEventListener('change', function () { state.to = to.value || today; render() })
    nav.appendChild(el('span', { class: 'group' }, [el('label', { for: 'f-preset', text: 'Periodo' }), preset, custom]))

    var used = function (field, dict) { var set = {}; DATA.sessions.forEach(function (s) { var v = s[field]; (Array.isArray(v) ? v : [v]).forEach(function (x) { if (x >= 0) set[x] = true }) }); return Object.keys(set).map(Number).sort(function (a, b) { return String(dict[a]).localeCompare(String(dict[b])) }) }
    nav.appendChild(multi('Progetto', 'projects', D.projects, used(S.project, D.projects)))
    nav.appendChild(multi('Tipo', 'kinds', D.kinds, used(S.kind, D.kinds)))
    nav.appendChild(multi('Modello', 'models', D.models, used(S.models, D.models)))
    if (D.branches.length) nav.appendChild(multi('Branch', 'branches', D.branches, used(S.branches, D.branches)))
    if (D.repos.length) nav.appendChild(multi('Repo', 'repos', D.repos, used(S.repo, D.repos)))
    var q = el('input', { type: 'search', class: 'search', placeholder: 'Cerca id o progetto', 'aria-label': 'Cerca', value: state.q })
    q.addEventListener('input', function () { state.q = q.value.trim(); render() })
    nav.appendChild(q)
    nav.appendChild(el('button', { type: 'button', text: 'Azzera filtri', onclick: function () {
      state.preset = 'tutto'; state.projects = []; state.kinds = []; state.models = []; state.branches = []; state.repos = []; state.q = ''; state.selected = null
      buildFilters(); render()
    } }))
  }

  // ------------------------------------------------------------ card e grafici

  function card(title, subtitle, legend, draw, tableRows, wide) {
    var parent = document.getElementById('kpi-charts')
    var box = el('article', { class: 'card' + (wide ? ' wide' : '') })
    var tableBox = el('div', { class: 'data-table' })
    tableBox.hidden = true
    var toggle = el('button', { type: 'button', text: 'Tabella', 'aria-expanded': 'false' })
    toggle.addEventListener('click', function () {
      tableBox.hidden = !tableBox.hidden
      toggle.setAttribute('aria-expanded', String(!tableBox.hidden))
      toggle.textContent = tableBox.hidden ? 'Tabella' : 'Grafico'
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
    var t = el('table')
    t.appendChild(el('thead', {}, [el('tr', {}, head.map(function (h, i) { return el('th', { class: num.indexOf(i) >= 0 ? 'num' : '', text: h }) }))]))
    t.appendChild(el('tbody', {}, rows.map(function (r) { return el('tr', {}, r.map(function (c, i) { return el('td', { class: num.indexOf(i) >= 0 ? 'num' : '', text: String(c) }) })) })))
    return t
  }

  function empty(node, text) { node.appendChild(el('p', { class: 'empty', text: text || 'Nessun dato nel periodo' })) }

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
    var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Grafico a colonne' })
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
    var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Grafico a barre' })
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
    var days = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
    var ramp = ['--seq-1', '--seq-2', '--seq-3', '--seq-4', '--seq-5', '--seq-6', '--seq-7'].map(css)
    var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Attività per ora e giorno' })
    for (var h = 0; h < 24; h += 3) g.appendChild(svg('text', { x: L + h * cw + cw / 2, y: 11, 'text-anchor': 'middle', class: 'tick', text: String(h) }))
    days.forEach(function (d, wd) {
      g.appendChild(svg('text', { x: L - 6, y: T + wd * ch + 15, 'text-anchor': 'end', class: 'tick', text: d }))
      for (var hh = 0; hh < 24; hh++) {
        (function (hour) {
          var v = cells[wd * 24 + hour] || 0
          var fill = v === 0 ? css('--grid') : ramp[Math.min(6, Math.floor((v / max) * 6.999))]
          var r = svg('rect', { x: L + hour * cw + 1, y: T + wd * ch + 1, width: cw - 2, height: ch - 2, rx: 3, fill: fill, class: 'mark', tabindex: '0' })
          var label = d + ' ' + two(hour) + ':00'
          var rows = [{ value: int(v), label: v === 1 ? 'turno' : 'turni' }]
          r.addEventListener('pointermove', function (e) { showTip(e, label, rows) })
          r.addEventListener('pointerleave', hideTip)
          g.appendChild(r)
        })(hh)
      }
    })
    node.appendChild(g)
  }

  // ------------------------------------------------------------ rendering

  function render() {
    var rows = filtered()
    var t = sumDays(rows)
    var r = rangeDays()
    document.getElementById('kpi-sub').textContent = 'Generato il ' + dateTime(DATA.meta.generatedAt) + ' · ' + DATA.meta.description + ' · ' + int(rows.length) + ' sessioni nel filtro'
    var notice = document.getElementById('kpi-notice')
    notice.hidden = !DATA.meta.trimmed
    notice.textContent = DATA.meta.trimmed ? 'Per stare nel limite di dimensione, le distribuzioni (tool, modelli, comandi…) delle sessioni più vecchie non sono incluse; totali e andamenti giornalieri sono completi. Rigenera con un periodo più corto per averle tutte.' : ''

    // Riquadri
    var tiles = document.getElementById('kpi-tiles')
    tiles.textContent = ''
    var inputTok = t.inp + t.cr + t.cw
    var sum = function (f) { return rows.reduce(function (a, x) { return a + (x.s[f] || 0) }, 0) }
    var testsOk = sum(S.testsOk), testsKo = sum(S.testsKo)
    var tileData = [
      ['hero', 'Costo', usd(t.cost), t.turns > 0 ? usd(t.cost / t.turns) + ' per turno' : ''],
      ['', 'Sessioni', int(rows.length), int(new Set(rows.map(function (x) { return x.s[S.project] })).size) + ' progetti'],
      ['', 'Turni', int(t.turns), int(t.prompts) + ' prompt'],
      ['', 'Tempo attivo', dur(t.active), t.turns > 0 ? dur(t.active / t.turns) + ' per turno' : ''],
      ['', 'Token totali', compact(inputTok + t.out), 'in ' + compact(inputTok) + ' · out ' + compact(t.out)],
      ['', 'Cache hit', inputTok > 0 ? pct(t.cr / inputTok) : '–', 'letti ' + compact(t.cr)],
      ['', 'Tool call', int(t.tools), t.tools > 0 ? pct(t.toolErr / t.tools) + ' in errore' : ''],
      ['', 'Righe', '+' + int(t.add) + ' −' + int(t.del), 'nette ' + int(t.add - t.del)],
      ['', 'Commit', int(t.commits), int(sum(S.prs)) + ' PR · ' + int(sum(S.pushes)) + ' push'],
      ['', 'Test', testsOk + testsKo > 0 ? pct(testsOk / (testsOk + testsKo)) : '–', int(testsOk) + ' superati · ' + int(testsKo) + ' falliti'],
      ['', 'Subagent', int(sum(S.agents)), int(sum(S.compactions)) + ' compattazioni'],
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
    var dayTable = function (cols) { return { head: ['Giorno'].concat(cols.map(function (c) { return c[0] })), rows: span.map(function (k, i) { return [dayLabel(k)].concat(cols.map(function (c) { return c[2](c[1][i]) })) }), num: cols.map(function (_, i) { return i + 1 }) } }

    var charts = document.getElementById('kpi-charts')
    charts.textContent = ''
    var cost = val('cost')
    card('Costo per giorno', 'USD calcolati da Claude Code', null, function (n) { columns(n, labels, [{ name: 'Costo', color: C.s1, values: cost }], usd) }, dayTable([['Costo', cost, usd]]))
    var tin = val('inp'), tcr = val('cr'), tcw = val('cw'), tout = val('out')
    var tokSeries = [{ name: 'Input', color: C.s1, values: tin }, { name: 'Cache letta', color: C.s2, values: tcr }, { name: 'Cache scritta', color: C.s3, values: tcw }, { name: 'Output', color: C.s4, values: tout }]
    card('Token per giorno', 'Impilati per tipo', tokSeries, function (n) { columns(n, labels, tokSeries, compact) }, dayTable([['Input', tin, int], ['Cache letta', tcr, int], ['Cache scritta', tcw, int], ['Output', tout, int]]))
    var adds = val('add'), dels = val('del')
    card('Righe di codice per giorno', 'Aggiunte sopra lo zero, rimosse sotto', [{ name: 'Aggiunte', color: C.s1 }, { name: 'Rimosse', color: C.s8 }], function (n) { columns(n, labels, [{ name: 'Aggiunte', color: C.s1, values: adds }], int, { name: 'Rimosse', color: C.s8, values: dels }) }, dayTable([['Aggiunte', adds, int], ['Rimosse', dels, int]]))
    var turns = val('turns'), commits = val('commits')
    card('Turni per giorno', null, null, function (n) { columns(n, labels, [{ name: 'Turni', color: C.s1, values: turns }], int) }, dayTable([['Turni', turns, int], ['Tempo attivo', val('active'), dur], ['Prompt', val('prompts'), int]]))
    card('Commit per giorno', null, null, function (n) { columns(n, labels, [{ name: 'Commit', color: C.s1, values: commits }], int) }, dayTable([['Commit', commits, int]]))

    // Heatmap
    var cells = new Array(168).fill(0)
    rows.forEach(function (x) { if (x.m) (x.m.h || []).forEach(function (p) { cells[p[0]] += p[1] }) })
    card('Attività per ora e giorno', 'Turni per fascia oraria (ora locale)', null, function (n) { heatmap(n, cells) }, { head: ['Giorno'].concat(Array.from({ length: 24 }, function (_, h) { return two(h) })), rows: ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map(function (d, wd) { return [d].concat(cells.slice(wd * 24, wd * 24 + 24)) }), num: Array.from({ length: 24 }, function (_, h) { return h + 1 }) })

    // Distribuzioni
    var tools = mapSum(rows, 't', null, D.tools).slice(0, 12)
    card('Tool più usati', 'Chiamate; nel tooltip errori e durata media', null, function (n) {
      hbars(n, tools.map(function (x) { return { label: x.name, value: x.v[0], err: x.v[1], ms: x.v[3] ? x.v[2] / x.v[3] : 0 } }), int, C.s1, function (it) { return [{ value: int(it.err), label: 'errori' }, { value: it.ms ? dur(it.ms) : '–', label: 'durata media' }] })
    }, { head: ['Tool', 'Chiamate', 'Errori', 'Durata media'], rows: tools.map(function (x) { return [x.name, int(x.v[0]), int(x.v[1]), x.v[3] ? dur(x.v[2] / x.v[3]) : '–'] }), num: [1, 2, 3] })
    var cats = mapSum(rows, 'c', null, D.cats)
    card('Bash per categoria', 'Comandi; nel tooltip esiti', null, function (n) {
      hbars(n, cats.map(function (x) { return { label: x.name, value: x.v[0], ok: x.v[1], err: x.v[2] } }), int, C.s1, function (it) { return [{ value: int(it.ok), label: 'ok' }, { value: int(it.err), label: 'errori' }] })
    }, { head: ['Categoria', 'Comandi', 'Ok', 'Errori'], rows: cats.map(function (x) { return [x.name, int(x.v[0]), int(x.v[1]), int(x.v[2])] }), num: [1, 2, 3] })
    var models = mapSum(rows, 'm', function (v) { return v[1] + v[2] + v[3] + v[4] }, D.models)
    card('Token per modello', 'Input + output + cache', null, function (n) {
      hbars(n, models.map(function (x) { return { label: x.name, value: x.v[1] + x.v[2] + x.v[3] + x.v[4], req: x.v[0] } }), compact, C.s1, function (it) { return [{ value: int(it.req), label: 'richieste' }] })
    }, { head: ['Modello', 'Richieste', 'Input', 'Output', 'Cache letta', 'Cache scritta'], rows: models.map(function (x) { return [x.name, int(x.v[0]), int(x.v[1]), int(x.v[2]), int(x.v[3]), int(x.v[4])] }), num: [1, 2, 3, 4, 5] })
    var cmds = mapSum(rows, 'b', null, D.cmds).slice(0, 12)
    card('Comandi Bash più usati', 'Solo programma e sottocomando', null, function (n) { hbars(n, cmds.map(function (x) { return { label: x.name, value: x.v[0] } }), int, C.s1) }, { head: ['Comando', 'Volte', 'Ok', 'Errori'], rows: cmds.map(function (x) { return [x.name, int(x.v[0]), int(x.v[1]), int(x.v[2])] }), num: [1, 2, 3] })
    var exts = mapSum(rows, 'x', function (v) { return v[1] + v[2] }, D.exts).slice(0, 12)
    card('Righe per estensione', 'Aggiunte + rimosse', null, function (n) { hbars(n, exts.map(function (x) { return { label: x.name, value: x.v[1] + x.v[2], add: x.v[1], del: x.v[2] } }), int, C.s1, function (it) { return [{ value: '+' + int(it.add), label: 'aggiunte' }, { value: '−' + int(it.del), label: 'rimosse' }] }) }, { head: ['Estensione', 'Modifiche', 'Aggiunte', 'Rimosse'], rows: exts.map(function (x) { return [x.name, int(x.v[0]), int(x.v[1]), int(x.v[2])] }), num: [1, 2, 3] })

    // Istogramma durata turni
    var hist = {}
    rows.forEach(function (x) { if (x.m && x.m.d) for (var b in x.m.d) hist[b] = (hist[b] || 0) + x.m.d[b] })
    var bins = [[0, 10e3, '<10s'], [10e3, 30e3, '10–30s'], [30e3, 60e3, '30s–1m'], [60e3, 180e3, '1–3m'], [180e3, 600e3, '3–10m'], [600e3, 1800e3, '10–30m'], [1800e3, Infinity, '>30m']]
    var histVals = bins.map(function (bin) { var c = 0; for (var b in hist) { var mid = +b <= 0 ? 0.5 : Math.pow(2, (+b - 0.5) / 4); if (mid >= bin[0] && mid < bin[1]) c += hist[b] } return c })
    card('Durata dei turni', 'Numero di turni per fascia di durata', null, function (n) { columns(n, bins.map(function (b) { return b[2] }), [{ name: 'Turni', color: C.s1, values: histVals }], int) }, { head: ['Fascia', 'Turni'], rows: bins.map(function (b, i) { return [b[2], int(histVals[i])] }), num: [1] })

    var agents = mapSum(rows, 'a', null, D.agents)
    card('Subagent per tipo', 'Avvii; nel tooltip durata e token', null, function (n) { hbars(n, agents.map(function (x) { return { label: x.name, value: x.v[0], ms: x.v[1], tok: x.v[2] } }), int, C.s1, function (it) { return [{ value: dur(it.ms), label: 'durata totale' }, { value: compact(it.tok), label: 'token' }] }) }, { head: ['Tipo', 'Avvii', 'Durata', 'Token', 'Tool', 'Errori'], rows: agents.map(function (x) { return [x.name, int(x.v[0]), dur(x.v[1]), compact(x.v[2]), int(x.v[3]), int(x.v[4])] }), num: [1, 2, 3, 4, 5] })
    var skills = mapSum(rows, 's', null, D.skills).slice(0, 10)
    card('Skill', null, null, function (n) { hbars(n, skills.map(function (x) { return { label: x.name, value: x.v[0] } }), int, C.s1) }, { head: ['Skill', 'Invocazioni'], rows: skills.map(function (x) { return [x.name, int(x.v[0])] }), num: [1] })
    var commands = mapSum(rows, 'o', null, D.commands).slice(0, 10)
    card('Comandi slash', null, null, function (n) { hbars(n, commands.map(function (x) { return { label: '/' + x.name, value: x.v[0] } }), int, C.s1) }, { head: ['Comando', 'Volte'], rows: commands.map(function (x) { return ['/' + x.name, int(x.v[0])] }), num: [1] })
    var mcp = mapSum(rows, 'p', null, D.mcp)
    if (mcp.length) card('Server MCP', null, null, function (n) { hbars(n, mcp.map(function (x) { return { label: x.name, value: x.v[0], err: x.v[1] } }), int, C.s1, function (it) { return [{ value: int(it.err), label: 'errori' }] }) }, { head: ['Server', 'Chiamate', 'Errori'], rows: mcp.map(function (x) { return [x.name, int(x.v[0]), int(x.v[1])] }), num: [1, 2] })

    // Permessi, errori, stop: tabelle compatte
    var perms = [['Consentiti', sum(S.allow)], ['Chiesti', sum(S.ask)], ['Negati', sum(S.deny)], ['Dialoghi mostrati', sum(S.dialogs)]]
    card('Permessi', null, null, function (n) { hbars(n, perms.map(function (p) { return { label: p[0], value: p[1] } }), int, C.s1) }, { head: ['Decisione', 'Volte'], rows: perms.map(function (p) { return [p[0], int(p[1])] }), num: [1] })
    var errs = mapSum(rows, 'e', null, D.errors).map(function (x) { return [x.name, x.v[0]] }).concat([['turni in errore', sum(S.turnErr)], ['interruzioni', sum(S.interrupts)], ['rifiuti', sum(S.refusals)]]).filter(function (x) { return x[1] > 0 })
    card('Errori e interruzioni', null, null, function (n) { hbars(n, errs.map(function (p) { return { label: p[0], value: p[1] } }), int, C.s8) }, { head: ['Tipo', 'Volte'], rows: errs.map(function (p) { return [p[0], int(p[1])] }), num: [1] })
    var stops = mapSum(rows, 'r', null, D.stops)
    card('Motivi di stop delle richieste', null, null, function (n) { hbars(n, stops.map(function (x) { return { label: x.name, value: x.v[0] } }), int, C.s1) }, { head: ['Motivo', 'Richieste'], rows: stops.map(function (x) { return [x.name, int(x.v[0])] }), num: [1] })

    renderSessions(rows)
    renderProjects(rows)
    document.getElementById('kpi-foot').textContent = 'kpi-tracker · dati registrati localmente da Claude Code · il costo è quello calcolato da Claude Code (equivalente API) · nessun testo di prompt o risposte è incluso.'
  }

  // ------------------------------------------------------------ tabelle

  function sessionValues(x) {
    var t = sumDays([x])
    return {
      start: x.s[S.start], project: D.projects[x.s[S.project]], id: x.s[S.id].slice(0, 8), kind: D.kinds[x.s[S.kind]], dur: Math.max(0, x.s[S.last] - x.s[S.start]),
      turns: t.turns, active: t.active, cost: t.cost, tokens: t.inp + t.out + t.cr + t.cw, tools: t.tools, add: t.add, del: t.del, commits: t.commits,
      branch: (x.s[S.branches].map(function (b) { return D.branches[b] }).slice(-1)[0]) || '–', status: x.s[S.status], t: t,
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
    box.appendChild(el('div', { class: 'card-head' }, [el('div', {}, [el('h2', { text: 'Sessioni (' + int(rows.length) + ')' }), el('p', { class: 'hint', text: 'Clic su una riga per il dettaglio · clic sulle intestazioni per ordinare' })])]))
    var data = rows.map(function (x) { return { x: x, v: sessionValues(x) } })
    sortable(box, [
      { key: 'start', label: 'Inizio', fmt: dateTime },
      { key: 'project', label: 'Progetto' },
      { key: 'id', label: 'ID' },
      { key: 'kind', label: 'Tipo' },
      { key: 'dur', label: 'Durata', num: true, fmt: dur },
      { key: 'turns', label: 'Turni', num: true, fmt: int },
      { key: 'active', label: 'Attivo', num: true, fmt: dur },
      { key: 'cost', label: 'Costo', num: true, fmt: usd },
      { key: 'tokens', label: 'Token', num: true, fmt: compact },
      { key: 'tools', label: 'Tool', num: true, fmt: int },
      { key: 'add', label: 'Righe', num: true, fmt: function (v, row) { return '+' + int(row.add) + ' −' + int(row.del) } },
      { key: 'commits', label: 'Commit', num: true, fmt: int },
      { key: 'branch', label: 'Branch' },
      { key: 'status', label: 'Stato', cls: function (v) { return 'status-' + v.status } },
    ], data, 'sort', function (d) { state.selected = d.x.i; render() })
    var sel = rows.filter(function (x) { return x.i === state.selected })[0]
    if (sel) box.appendChild(detail(sel))
  }

  function detail(x) {
    var s = x.s, t = sumDays([x])
    var items = [
      ['Sessione', s[S.id]], ['Progetto', D.projects[s[S.project]]], ['Percorso', D.paths[s[S.path]]], ['Tipo · stato', D.kinds[s[S.kind]] + ' · ' + s[S.status]],
      ['Inizio', dateTime(s[S.start])], ['Ultima attività', dateTime(s[S.last])], ['Segmenti', int(s[S.segments])], ['Versione', s[S.version] || '–'],
      ['Modelli', s[S.models].map(function (m) { return D.models[m] }).join(', ') || '–'], ['Branch', s[S.branches].map(function (b) { return D.branches[b] }).join(', ') || '–'],
      ['Costo', usd(t.cost)], ['Turni (subagent)', int(t.turns) + ' (' + int(s[S.subTurns]) + ')'], ['Tempo attivo', dur(t.active)], ['Prompt · richieste', int(t.prompts) + ' · ' + int(t.req)],
      ['Token in · out', compact(t.inp + t.cr + t.cw) + ' · ' + compact(t.out)], ['Cache hit', t.inp + t.cr + t.cw > 0 ? pct(t.cr / (t.inp + t.cr + t.cw)) : '–'],
      ['TTFT mediano', s[S.ttft] ? dur(s[S.ttft]) : '–'], ['Contesto max', int(s[S.ctxMax]) + '%'], ['Rate limit 5h · 7g (max)', (s[S.r5] >= 0 ? int(s[S.r5]) + '%' : '–') + ' · ' + (s[S.r7] >= 0 ? int(s[S.r7]) + '%' : '–')],
      ['Compattazioni', int(s[S.compactions])], ['Tool (errori)', int(t.tools) + ' (' + int(t.toolErr) + ')'], ['Righe', '+' + int(t.add) + ' −' + int(t.del)],
      ['File creati · modificati · letti', int(s[S.created]) + ' · ' + int(s[S.modified]) + ' · ' + int(s[S.read])], ['Commit · push · PR', int(t.commits) + ' · ' + int(s[S.pushes]) + ' · ' + int(s[S.prs])],
      ['Test ok · ko', int(s[S.testsOk]) + ' · ' + int(s[S.testsKo])], ['Build ok · ko', int(s[S.buildsOk]) + ' · ' + int(s[S.buildsKo])], ['Subagent', int(s[S.agents])],
      ['Permessi consentiti · chiesti · negati', int(s[S.allow]) + ' · ' + int(s[S.ask]) + ' · ' + int(s[S.deny])], ['Errori turno · interruzioni · rifiuti', int(s[S.turnErr]) + ' · ' + int(s[S.interrupts]) + ' · ' + int(s[S.refusals])],
    ]
    var dl = el('dl')
    items.forEach(function (it) { dl.appendChild(el('div', {}, [el('dt', { text: it[0] }), el('dd', { text: String(it[1]) })])) })
    return el('div', { class: 'detail-panel' }, [el('h2', { text: 'Dettaglio sessione ' + s[S.id].slice(0, 8) }), dl])
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
      var g = groups[k], t = sumDays(g.rows)
      return { v: { name: g.name, path: g.path, sessions: g.sessions, last: g.last, turns: t.turns, active: t.active, cost: t.cost, tokens: t.inp + t.out + t.cr + t.cw, add: t.add, del: t.del, commits: t.commits } }
    })
    box.appendChild(el('div', { class: 'card-head' }, [el('h2', { text: 'Progetti (' + int(data.length) + ')' })]))
    sortable(box, [
      { key: 'name', label: 'Progetto' },
      { key: 'path', label: 'Percorso' },
      { key: 'sessions', label: 'Sessioni', num: true, fmt: int },
      { key: 'last', label: 'Ultima attività', fmt: dateTime },
      { key: 'turns', label: 'Turni', num: true, fmt: int },
      { key: 'active', label: 'Attivo', num: true, fmt: dur },
      { key: 'cost', label: 'Costo', num: true, fmt: usd },
      { key: 'tokens', label: 'Token', num: true, fmt: compact },
      { key: 'add', label: 'Righe', num: true, fmt: function (v, row) { return '+' + int(row.add) + ' −' + int(row.del) } },
      { key: 'commits', label: 'Commit', num: true, fmt: int },
    ], data, 'psort', null)
  }

  // ------------------------------------------------------------ tema

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

  buildFilters()
  render()
})()
