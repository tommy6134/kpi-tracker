/**
 * Aprire un file o una cartella con l'applicazione predefinita del sistema:
 * il browser per il report, il file manager (Finder, Esplora file, Nautilus…)
 * per una cartella. Un report HTML aperto da `file://` non può avviare
 * programmi: la cartella si apre da qui, con `/kpi cartella` o `--cartella`.
 */

import type { Host } from '../host'

/** Il sistema: `uname -s` (`Darwin`, `Linux`, `MINGW…`, `Windows_NT` se manca) e se è Linux dentro WSL. */
export type Platform = { os: string; wsl: boolean }

const isWindows = (os: string): boolean => /windows|mingw|msys|cygwin/i.test(os)

/** L'argv per aprire un percorso fuori da WSL. */
export function openArgv(os: string, path: string): string[] {
  if (isWindows(os)) {
    return ['cmd', '/c', 'start', '', path]
  }

  return os === 'Darwin' ? ['open', path] : ['xdg-open', path]
}

/** `true` se `/proc/version` dice WSL (`microsoft-standard-WSL2`, `Microsoft`). */
export const isWslKernel = (procVersion: string): boolean => /microsoft|wsl/i.test(procVersion)

/**
 * Apre `path` (file o cartella); `true` se il programma è partito. In WSL il
 * percorso si converte con `wslpath -w` e lo apre `explorer.exe`, che esce
 * con 1 anche quando riesce: lì conta solo che sia partito.
 */
export async function openPath(host: Host, platform: Platform, path: string): Promise<boolean> {
  if (platform.wsl) {
    const converted = await host.run(['wslpath', '-w', path], { timeoutMs: 3000 }).catch(() => null)
    const target = converted !== null && converted.exitCode === 0 ? converted.stdout.trim() : ''

    return target !== '' && (await host.run(['explorer.exe', target], { timeoutMs: 10_000 }).then(() => true, () => false))
  }

  const result = await host.run(openArgv(platform.os, path), { timeoutMs: 10_000 }).catch(() => null)

  return result !== null && result.exitCode === 0
}
