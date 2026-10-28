/**
 * Gli eventi grezzi che il tracker salva, una riga JSON ciascuno nei chunk
 * `events/<segmento>-NNNN.jsonl`. Sono la fonte di verità: summary e dettagli
 * si ricavano con un fold puro (analysis/reducer.ts).
 *
 * Privacy per costruzione: nessun campo porta testo di prompt, risposte,
 * argomenti di comandi o query di URL; solo numeri, nomi e percorsi di file.
 */

export const SCHEMA_VERSION = 1

/** Il tipo di sessione, come lo mostrano i report. */
export type KpiKind = 'interattiva' | 'print' | 'sdk' | 'desktop' | 'vscode' | 'sconosciuta'

/** Categorie dei comandi Bash. */
export type BashCat = 'git' | 'test' | 'build' | 'package' | 'docker' | 'fs' | 'network' | 'altro'

/** Classe di un file toccato (`cobol` e `mainframe` dalla 0.5.0: prima erano `src` o `altro`). */
export type FileClass = 'src' | 'test' | 'doc' | 'config' | 'cobol' | 'mainframe' | 'altro'

/**
 * Esito di una tool call: riuscita, errore, negata da regola, modalità o hook,
 * interrotta, rifiutata dall'utente nel dialogo dei permessi (`rej`, dalla
 * 0.5.0), negata dal classificatore della modalità auto (`cls`, dalla 0.5.0).
 */
export type ToolStatus = 'ok' | 'err' | 'deny' | 'intr' | 'rej' | 'cls'

export type GitInfo = {
  /** Commit: sha a 7 caratteri, tipo (committed/amended/cherry-picked), branch. */
  c?: [string, string, string?]
  /** Push: branch. */
  p?: string
  /** Operazione di branch (merged/rebased/…) e branch. */
  b?: [string, string?]
  /** PR: numero, azione, URL. */
  pr?: [number, string, string?]
}

export type ToolExtra =
  | {
      k: 'bash'
      /** `programma sottocomando` di ogni comando semplice, mai argomenti. */
      cmds: string[]
      cat: BashCat
      pipe?: 1
      bg?: 1
      to?: 1
      intr?: 1
      sbx?: 1
      git?: GitInfo
    }
  | {
      k: 'file'
      op: 'edit' | 'write' | 'notebook' | 'read'
      path: string
      ext: string
      cls: FileClass
      add?: number
      del?: number
      cr?: 1
      um?: 1
      lines?: number
      out?: 1
    }
  | { k: 'agent'; type?: string; st?: string; ms?: number; tok?: number; tools?: number; id?: string }
  | { k: 'skill'; name: string; ok: boolean }
  | { k: 'web'; host: string; code?: number; bytes?: number; ms?: number }
  | { k: 'search'; n?: number; secs?: number }
  | { k: 'todo'; total: number; done: number }
  | { k: 'wf'; name?: string; st?: string }

type Base = {
  /** Sequenza nel segmento, da 1. */
  q: number
  /** Istante in ms. */
  t: number
  /** agentId quando l'evento viene da un subagent. */
  a?: string
}

export type ResumeInfo = { s?: number; ctx?: number; exp?: 1 }

export type KpiEventBody =
  | {
      e: 'seg.start'
      seg: string
      src: string
      ver: string
      base?: string
      kind: KpiKind
      model?: string
      pm?: string
      tz: number
      cost0: number
      resume?: ResumeInfo
      /**
       * 1 se il processo aveva già un'altra sessione (cambio con /resume o dopo
       * /clear: il ledger del costo è quello dell'altra), 0 se no. Assente negli
       * eventi scritti prima della 0.4.0.
       */
      sw?: 0 | 1
    }
  | { e: 'seg.src'; src: string; model?: string; resume?: ResumeInfo }
  | { e: 'seg.end'; reason: string }
  | { e: 'meta'; branch?: string | null; repo?: { root: string; remote: string | null; name: string | null } | null }
  | { e: 'prompt'; o: string; ch: number; w: number; ln: number; att?: Record<string, number>; qd?: 1; th?: number }
  | { e: 'psrc'; s: string }
  | { e: 'expand'; k: string; name: string }
  | { e: 'mention'; type: string; ext: string; path: string }
  | { e: 'turn.start'; tu: string }
  | {
      e: 'step'
      tu: string
      i: number
      m: string
      um?: string
      ef?: string
      ms: number
      ttft?: number
      gen?: number
      in: number
      out: number
      cr: number
      cw: number
      stop: string | null
      tools: number
      srv?: [string, number][]
    }
  | {
      e: 'turn.end'
      tu: string
      ms: number
      r: string
      rc?: string | null
      m?: string
      in?: number
      out?: number
      cr?: number
      cw?: number
      /** Quante richieste (`step`) del turno sono state registrate: 0 = token presi da qui. */
      ns: number
      ans: number
    }
  | {
      e: 'measure'
      /** 1 se letta dal ledger fuori da un turno (subagent finiti dopo, servizi, uscita), non da `session.measure`. */
      p?: 1
      cost?: number
      ctx?: number
      win?: number
      pct?: number
      rl?: [string, number, string?][]
    }
  | { e: 'tool'; id: string; tool: string; st: ToolStatus; wall: number; ro?: 1; mcp?: string; x?: ToolExtra }
  | { e: 'tool.ms'; id: string; tool: string; ms: number; intr?: 1 }
  | { e: 'batch'; n: number }
  | { e: 'perm'; tool: string; d: string; by: string }
  | { e: 'perm.dialog'; tool: string }
  | { e: 'perm.denied'; tool: string }
  | { e: 'agent.spawn'; id?: string; type: string; m?: string; bg?: 1; fork?: 1; team?: 1; wf?: string }
  | { e: 'agent.start'; id: string; type: string }
  | { e: 'agent.stop'; id: string; type: string }
  | { e: 'compact'; tr: string; b?: number; af?: number; in?: number; out?: number; cr?: number; cw?: number }
  | { e: 'cmd'; name: string; o: string }
  | { e: 'skill'; name: string }
  | { e: 'model.switch'; from: string; to: string; src: string }
  | { e: 'stop.fail'; err: string }
  | { e: 'notif'; type: string }
  | { e: 'instr'; mt: string; lr: string }
  | { e: 'cwd'; to: string }
  | { e: 'task'; ev: 'created' | 'completed' }
  /** Documenti creati e rigenerati da un turno, per estensione (dalla 0.5.0; mai i nomi dei file). */
  | { e: 'docs'; cr?: Record<string, number>; rg?: Record<string, number> }

export type KpiEvent = Base & KpiEventBody

export type KpiEventName = KpiEventBody['e']

/** Una riga JSONL. */
export function encodeEvent(event: KpiEvent): string {
  return JSON.stringify(event)
}

/** Gli eventi validi di un testo JSONL; le righe rotte (scrittura interrotta) si saltano. */
export function decodeEvents(text: string): KpiEvent[] {
  const out: KpiEvent[] = []

  for (const line of text.split('\n')) {
    const trimmed = line.trim()

    if (trimmed === '') {
      continue
    }

    try {
      const value = JSON.parse(trimmed) as Partial<KpiEvent>

      if (typeof value === 'object' && value !== null && typeof value.e === 'string' && typeof value.q === 'number' && typeof value.t === 'number') {
        out.push(value as KpiEvent)
      }
    } catch {
      // riga incompleta: si salta
    }
  }

  return out
}
