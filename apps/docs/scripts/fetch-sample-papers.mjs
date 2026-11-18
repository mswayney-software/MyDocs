// Downloads the real sample papers listed in e2e/fixtures/sample-papers.json for the Word
// import test. They belong to their schools, so they are kept out of git (see .gitignore);
// the test skips any that are missing.   Usage: node scripts/fetch-sample-papers.mjs
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'

const list = JSON.parse(readFileSync('e2e/fixtures/sample-papers.json', 'utf8'))
const dir = 'e2e/fixtures/docx-online'
mkdirSync(dir, { recursive: true })
let failed = 0
for (const p of list) {
  const path = `${dir}/${p.file}`
  if (existsSync(path)) continue
  const res = await fetch(p.url, { headers: { 'User-Agent': 'Mozilla/5.0 (sample paper fetch)' } })
  const buf = Buffer.from(await res.arrayBuffer())
  // A .docx is a zip file: it starts with "PK".
  if (!res.ok || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    console.error(`skipped ${p.file}: ${res.status} ${res.headers.get('content-type')}`)
    failed++
    continue
  }
  writeFileSync(path, buf)
  console.log(`fetched ${p.file} (${Math.round(buf.length / 1024)} KB)`)
}
process.exitCode = failed ? 1 : 0
