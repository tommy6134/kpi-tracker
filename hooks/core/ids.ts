/** Identificatori e hash brevi, senza dipendenze. */

/** Hash a 32 bit (stile `String.hashCode` di Java) in base 36, sempre positivo. */
export function hash36(text: string): string {
  let hash = 0

  for (let index = 0; index < text.length; index += 1) {
    hash = (Math.imul(31, hash) + text.charCodeAt(index)) | 0
  }

  return (hash >>> 0).toString(36)
}

/** `count` caratteri esadecimali casuali (crypto se c'è, altrimenti Math.random). */
export function randomHex(count: number): string {
  const bytes = new Uint8Array(Math.ceil(count / 2))

  try {
    crypto.getRandomValues(bytes)
  } catch {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  return [...bytes]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, count)
}

/** L'id di un segmento: `s` + numero a 2 cifre + 4 esadecimali casuali (`s03-7f3a`). */
export function segmentId(index: number, hex: string = randomHex(4)): string {
  return `s${String(index).padStart(2, '0')}-${hex}`
}
