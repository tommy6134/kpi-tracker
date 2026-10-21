/**
 * Lo store di una sessione: assegna la sequenza agli eventi, li applica al
 * reducer e li salva. `$.fs.write` riscrive il file intero, quindi:
 *
 * - gli eventi vanno nel chunk corrente del segmento (ruotato oltre 512 KiB);
 * - ogni flush fotografa in modo sincrono righe in attesa, summary e
 *   `lastSeq`, poi scrive prima i chunk e poi session.json: session.json non
 *   conta mai eventi che non siano già su disco;
 * - i flush passano da un'unica coda, così non si sovrappongono.
 */

import { apply, type ReduceState } from '../analysis/reducer'
import type { KpiDetails } from '../analysis/summary-types'
import type { HostFs } from '../host'
import { encodeEvent, type KpiEvent, type KpiEventBody } from './events'
import { chunkName, join } from './paths'
import type { KpiSegment, KpiSessionFile } from './session-file'

export const CHUNK_MAX = 512 * 1024

export type StoreTarget = {
  /** Cartella della sessione. */
  dir: string
  file: KpiSessionFile
  details: KpiDetails
  segment: KpiSegment
  /** Indice (da 1) e testo del chunk corrente del segmento. */
  chunkIndex: number
  chunkText: string
}

export type SessionStore = {
  readonly dir: string
  readonly file: KpiSessionFile
  readonly details: KpiDetails
  readonly segment: KpiSegment
  readonly state: ReduceState
  /** Registra un evento: sequenza, reducer, buffer. */
  emit: (body: KpiEventBody, t: number, agentId?: string) => KpiEvent
  /** Salva quanto in attesa (in coda dopo eventuali flush in corso). */
  flush: (now: number) => Promise<void>
  /** Segna session.json da riscrivere anche senza eventi nuovi (heartbeat, metadati). */
  touch: () => void
  /** Segna details.json da riscrivere. */
  touchDetails: () => void
  readonly isDirty: () => boolean
  readonly pending: () => number
}

export function sessionStoreOf(fs: HostFs, target: StoreTarget): SessionStore {
  const { dir, file, details, segment } = target
  const state: ReduceState = { summary: file.summary, details, tz: file.tzOffsetMin }
  const buffer: string[] = []
  let seq = segment.lastSeq
  let chunkIndex = Math.max(1, target.chunkIndex)
  let chunkText = target.chunkText
  let isMetaDirty = true
  let isDetailsDirty = true
  let chain: Promise<void> = Promise.resolve()
  /** Scritture fallite da ritentare (ultimo testo per percorso). */
  const retry = new Map<string, string>()

  const eventsDir = join(dir, 'events')

  async function flushNow(now: number): Promise<void> {
    if (buffer.length === 0 && !isMetaDirty && !isDetailsDirty && retry.size === 0) {
      return
    }

    // Fotografia sincrona: righe, chunk, summary e lastSeq coerenti tra loro.
    const lines = buffer.splice(0)
    const toWrite: { path: string; text: string }[] = [...retry.entries()].map(([path, text]) => ({ path, text }))

    retry.clear()

    for (const line of lines) {
      if (chunkText.length > 0 && chunkText.length + line.length + 1 > CHUNK_MAX) {
        toWrite.push({ path: join(eventsDir, chunkName(segment.id, chunkIndex)), text: chunkText })
        chunkIndex += 1
        chunkText = ''
      }

      chunkText += `${line}\n`
    }

    if (lines.length > 0) {
      toWrite.push({ path: join(eventsDir, chunkName(segment.id, chunkIndex)), text: chunkText })
    }

    segment.lastSeq = seq
    segment.chunks = chunkText === '' ? chunkIndex - 1 : chunkIndex
    file.updatedAt = Math.max(file.updatedAt, now)
    file.heartbeatAt = now
    file.diag.flushes += 1

    const sessionJson = JSON.stringify(file)
    const detailsJson = isDetailsDirty ? JSON.stringify(details) : null

    isMetaDirty = false
    isDetailsDirty = false

    let done = 0

    try {
      for (const item of toWrite) {
        await fs.write(item.path, item.text)
        file.diag.bytes += item.text.length
        done += 1
      }

      await fs.write(join(dir, 'session.json'), sessionJson)
      file.diag.bytes += sessionJson.length

      if (detailsJson !== null) {
        await fs.write(join(dir, 'details.json'), detailsJson)
        file.diag.bytes += detailsJson.length
      }
    } catch (error) {
      file.diag.flushErrors += 1
      file.diag.lastError = (error instanceof Error ? error.message : String(error)).slice(0, 200)
      // Si ritentano i chunk non scritti (il chunk corrente è comunque in memoria).
      for (const item of toWrite.slice(done)) {
        retry.set(item.path, item.text)
      }

      isMetaDirty = true
      isDetailsDirty = detailsJson !== null || isDetailsDirty
    }
  }

  return {
    dir,
    file,
    details,
    segment,
    state,
    emit(body, t, agentId) {
      seq += 1

      const event = { q: seq, t, ...(agentId !== undefined && { a: agentId }), ...body } as KpiEvent

      apply(state, event)
      buffer.push(encodeEvent(event))
      isDetailsDirty = isDetailsDirty || DETAIL_EVENTS.has(body.e)

      return event
    },
    flush(now) {
      chain = chain.then(() => flushNow(now)).catch(() => undefined)

      return chain
    },
    touch() {
      isMetaDirty = true
    },
    touchDetails() {
      isDetailsDirty = true
    },
    isDirty: () => buffer.length > 0 || isMetaDirty || isDetailsDirty,
    pending: () => buffer.length,
  }
}

/** Gli eventi che cambiano details.json. */
const DETAIL_EVENTS = new Set<string>(['turn.end', 'measure', 'tool', 'agent.spawn', 'agent.start', 'agent.stop', 'compact', 'model.switch'])
