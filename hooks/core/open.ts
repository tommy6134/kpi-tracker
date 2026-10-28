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

/**
 * L'argv per aprire un percorso fuori da WSL. Su Windows explorer.exe, mai
 * `cmd /c start`: senza shell un argomento senza spazi arriva senza virgolette,
 * e cmd rileggerebbe `&`, `|`, `%`, `^` del percorso. explorer.exe vuole `\`.
 */
export function openArgv(os: string, path: string): string[] {
  if (isWindows(os)) {
    return ['explorer.exe', path.replace(/\//g, '\\')]
  }

  return os === 'Darwin' ? ['open', path] : ['xdg-open', path]
}

/** `true` se `/proc/version` dice WSL (`microsoft-standard-WSL2`, `Microsoft`). */
export const isWslKernel = (procVersion: string): boolean => /microsoft|wsl/i.test(procVersion)

/**
 * Apre `path` (file o cartella); `true` se il programma è partito. Su Windows
 * e in WSL lo apre `explorer.exe` (in WSL dopo `wslpath -w`), che esce con 1
 * anche quando riesce: lì conta solo che sia partito.
 */
export async function openPath(host: Host, platform: Platform, path: string): Promise<boolean> {
  if (platform.wsl) {
    const converted = await host.run(['wslpath', '-w', path], { timeoutMs: 3000 }).catch(() => null)
    const target = converted !== null && converted.exitCode === 0 ? converted.stdout.trim() : ''

    return target !== '' && (await host.run(['explorer.exe', target], { timeoutMs: 10_000 }).then(() => true, () => false))
  }

  const argv = openArgv(platform.os, path)
  const result = await host.run(argv, { timeoutMs: 10_000 }).catch(() => null)

  return result !== null && (result.exitCode === 0 || argv[0] === 'explorer.exe')
}
