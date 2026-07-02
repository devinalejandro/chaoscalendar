/** Runtime id generator. Deterministic ids (paychecks, seed data) are built
    by hand elsewhere — this is only for entities created interactively. */
let fallbackCounter = 0

export function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }
  fallbackCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${fallbackCounter}`
}
