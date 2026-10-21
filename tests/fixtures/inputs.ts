import type { RenderInput, SessionStartInput } from 'claude-code'

import { CWD, SESSION_ID } from './world'

export const SESSION: SessionStartInput = { surface: 'terminal', isInteractive: true, cwd: CWD }
export const HEADLESS: SessionStartInput = { surface: null, isInteractive: false, cwd: CWD }

const base = { session_id: SESSION_ID, transcript_path: '/tmp/t.jsonl', cwd: CWD }

export const classicStart = (source: 'startup' | 'resume' | 'clear' | 'compact' | 'fork', sessionId = SESSION_ID) => ({
  ...base,
  session_id: sessionId,
  hook_event_name: 'SessionStart' as const,
  source,
  model: 'claude-opus-5-5',
})

export const BAND: RenderInput<'AbovePrompt'> = {
  component: 'AbovePrompt',
  surface: 'terminal',
  requestId: 'band',
  viewport: { columns: 160, rows: 48, isFullscreen: true },
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 140, scroll: { offset: 0, bodyRows: 19 }, view: {} },
}

export const PANE: RenderInput<'Pane'> = {
  component: 'Pane',
  surface: 'terminal',
  requestId: 'kpi-live',
  viewport: { columns: 180, rows: 48, isFullscreen: true },
  props: { title: 'KPI · sessione', isFocused: false, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 44 }, view: {} },
}

export const command = (name: string, args = '') => ({
  command: name,
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: true, columns: 160 },
})

export const commandOutput = (text: string): RenderInput<'CommandOutput'> => ({
  component: 'CommandOutput',
  surface: 'terminal',
  requestId: 'msg-1',
  viewport: { columns: 160, rows: 48, isFullscreen: true },
  props: { command: 'kpi', args: '', text, isErrored: false },
})
