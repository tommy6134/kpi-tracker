/**
 * Ripristino dai chunk: gli eventi scritti dopo l'ultimo session.json
 * (crash, reload a metà flush) si rigiocano; `rebuild` rifà tutto da zero.
 */

import { foldEvents, type ReduceState } from '../analysis/reducer'
import { emptyDetails, emptySummary, type KpiDetails, type KpiSummary } from '../analysis/summary-types'
import type { HostFs } from '../host'
import { decodeEvents, type KpiEvent } from './events'
import { join, parseChunk } from './paths'
import type { KpiSessionFile } from './session-file'

/** Legge e analizza un file JSON; `null` se manca o è rotto. */
export async function readJson<T>(fs: HostFs, path: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.read(path)) as T
  } catch {
    return null
  }
}

/** I chunk della cartella `events/` per segmento, in ordine di indice. */
export async function chunksOf(fs: HostFs, dir: string): Promise<Map<string, { index: number; name: string }[]>> {
  const out = new Map<string, { index: number; name: string }[]>()
  let entries: { name: string; kind: string }[] = []

  try {
    entries = await fs.list(join(dir, 'events'))
  } catch {
    return out
  }

  for (const entry of entries) {
    if (entry.kind !== 'file') {
      continue
    }

    const parsed = parseChunk(entry.name)

    if (parsed === null) {
      continue
    }

    const list = out.get(parsed.segId) ?? []

    list.push({ index: parsed.index, name: entry.name })
    out.set(parsed.segId, list)
  }

  for (const list of out.values()) {
    list.sort((a, b) => a.index - b.index)
  }

  return out
}

/** Legge gli eventi di un segmento con `q > afterSeq`, leggendo i chunk dall'ultimo all'indietro. */
export async function tailOf(fs: HostFs, dir: string, chunks: readonly { index: number; name: string }[], afterSeq: number): Promise<KpiEvent[]> {
  const collected: KpiEvent[][] = []

  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    const chunk = chunks[index] as { name: string }
    let events: KpiEvent[] = []

    try {
      events = decodeEvents(await fs.read(join(dir, 'events', chunk.name)))
    } catch {
      continue
    }

    collected.unshift(events.filter(event => event.q > afterSeq))

    if (events.length === 0 || (events[0] as KpiEvent).q <= afterSeq + 1) {
      break
    }
  }

  return collected.flat().sort((a, b) => a.q - b.q)
}

/**
 * Rigioca sugli stati in memoria gli eventi su disco successivi a
 * `lastSeq` di ogni segmento. Restituisce quanti eventi ha applicato.
 */
export async function replayTail(fs: HostFs, dir: string, file: KpiSessionFile, details: KpiDetails): Promise<number> {
  const chunks = await chunksOf(fs, dir)
  const state: ReduceState = { summary: file.summary, details, tz: file.tzOffsetMin }
  let applied = 0

  for (const segment of file.segments) {
    const list = chunks.get(segment.id) ?? []

    if (list.length === 0) {
      continue
    }

    const tail = await tailOf(fs, dir, list, segment.lastSeq)

    if (tail.length > 0) {
      foldEvents(state, tail)
      segment.lastSeq = (tail.at(-1) as KpiEvent).q
      applied += tail.length
    }

    segment.chunks = Math.max(segment.chunks, (list.at(-1) as { index: number }).index)

    if (segment.endedAt === undefined) {
      segment.endedAt = Math.max(segment.startedAt, file.summary.lastAt)
      segment.endReason = 'interrotta'
    }
  }

  return applied
}

/** Tutti gli eventi di una sessione, segmento per segmento nell'ordine di session.json (poi gli altri). */
export async function allEventsOf(fs: HostFs, dir: string, segmentOrder: readonly string[]): Promise<KpiEvent[][]> {
  const chunks = await chunksOf(fs, dir)
  const order = [...segmentOrder, ...[...chunks.keys()].filter(id => !segmentOrder.includes(id)).sort()]
  const out: KpiEvent[][] = []

  for (const segId of order) {
    const list = chunks.get(segId) ?? []
    const events: KpiEvent[] = []

    for (const chunk of list) {
      try {
        events.push(...decodeEvents(await fs.read(join(dir, 'events', chunk.name))))
      } catch {
        // chunk illeggibile: si salta
      }
    }

    out.push(events.sort((a, b) => a.q - b.q))
  }

  return out
}

/** Ricostruisce summary e dettagli da zero dagli eventi su disco. */
export async function rebuildFrom(fs: HostFs, dir: string, file: KpiSessionFile): Promise<{ summary: KpiSummary; details: KpiDetails; events: number }> {
  const segments = await allEventsOf(fs, dir, file.segments.map(segment => segment.id))
  const state: ReduceState = { summary: emptySummary(file.kind), details: emptyDetails(), tz: file.tzOffsetMin }
  let events = 0

  for (const list of segments) {
    foldEvents(state, list)
    events += list.length

    const segId = list.find(event => event.e === 'seg.start')
    const last = list.at(-1)

    if (segId !== undefined && segId.e === 'seg.start' && last !== undefined) {
      const segment = file.segments.find(one => one.id === segId.seg)

      if (segment !== undefined) {
        segment.lastSeq = last.q
      }
    }
  }

  return { summary: state.summary, details: state.details, events }
}
