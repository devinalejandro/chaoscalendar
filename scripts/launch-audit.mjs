import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const requiredFiles = [
  'app/public/manifest.webmanifest',
  'app/public/sw.js',
  'app/public/legacy/index.html',
  'LAUNCH_CHECKLIST.md',
  'netlify.toml',
]

const failures = []

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) failures.push(`Missing ${file}`)
}

const netlifyToml = readFileSync(join(root, 'netlify.toml'), 'utf8')
if (!netlifyToml.includes('publish = "app/dist"')) failures.push('Netlify publish directory is not app/dist')
if (!netlifyToml.includes('https://*.supabase.co')) failures.push('CSP does not allow Supabase connections')
if (!netlifyToml.includes('from = "/legacy"')) failures.push('Legacy redirect is missing')

const appHtml = readFileSync(join(root, 'app/index.html'), 'utf8')
if (!appHtml.includes('Karla')) failures.push('App title does not mention Karla')
if (!appHtml.includes('manifest.webmanifest')) failures.push('App manifest link is missing')

if (failures.length) {
  console.error('Launch audit failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Launch audit passed.')
