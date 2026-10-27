/**
 * Testi del plugin in italiano e in inglese. Il testo italiano resta nel
 * codice ed è la chiave del catalogo inglese (en.ts), con i segnaposto
 * `{nome}`: `L.t('Esportate {n} righe', { n })`. Il catalogo è tipizzato,
 * quindi un testo senza traduzione non compila.
 *
 * I valori salvati su disco (tipo di sessione, sorgente, categorie…) restano
 * codici italiani e si traducono solo quando si mostrano, con `L.code`.
 */

import { fmtOf, type Fmt } from '../format/fmt'
import { CODES_EN } from './codes'
import { EN } from './en'
import type { Lang } from './lang'

export { langOf, LANGS, type Lang } from './lang'

export type MsgKey = keyof typeof EN

export type Params = Readonly<Record<string, string | number>>

export type I18n = Fmt & {
  lang: Lang
  /** Il testo nella lingua, con i segnaposto `{nome}` sostituiti. */
  t: (key: MsgKey, params?: Params) => string
  /** L'etichetta di un codice salvato (`interattiva` → `interactive`); un codice sconosciuto resta com'è. */
  code: (value: string) => string
  /** `1 sessione`, `3 sessioni` nella lingua. */
  count: (n: number, one: MsgKey, many: MsgKey) => string
}

const fill = (text: string, params?: Params): string => (params === undefined ? text : text.replace(/\{(\w+)\}/g, (match, name: string) => (params[name] === undefined ? match : String(params[name]))))

function i18nFor(lang: Lang): I18n {
  const fmt = fmtOf(lang)
  const t = (key: MsgKey, params?: Params): string => fill(lang === 'en' ? EN[key] : key, params)

  return {
    ...fmt,
    lang,
    t,
    code: value => (lang === 'en' ? (CODES_EN[value] ?? value) : value),
    count: (n, one, many) => fmt.plural(n, t(one), t(many)),
  }
}

const CACHE: Record<Lang, I18n> = { it: i18nFor('it'), en: i18nFor('en') }

/** I testi e i formati di una lingua. */
export const i18nOf = (lang: Lang): I18n => CACHE[lang]
