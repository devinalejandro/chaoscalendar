/** All amounts are integer cents. Parsing accepts "1,893.48", "$45", "7.60". */

export function parseCents(input: string | number): number | null {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? Math.round(input * 100) : null
  }
  const cleaned = input.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const [whole, frac = ''] = cleaned.split('.')
  return parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, '0') || '0', 10)
}

export function formatCents(cents: number, opts: { sign?: boolean } = {}): string {
  const neg = cents < 0
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100)
  const frac = abs % 100
  const body = `$${dollars.toLocaleString('en-US')}${frac ? '.' + String(frac).padStart(2, '0') : ''}`
  if (neg) return `-${body}`
  return opts.sign ? `+${body}` : body
}
