import fs from 'node:fs'
console.log('=== vite.config.ts ===')
console.log(fs.readFileSync('D:/pi-web/frontend/vite.config.ts', 'utf8'))
console.log('=== frontend package.json scripts ===')
const pk = JSON.parse(fs.readFileSync('D:/pi-web/frontend/package.json', 'utf8'))
console.log(JSON.stringify(pk.scripts, null, 2))
console.log('=== server.mjs static/public ===')
const s = fs.readFileSync('D:/pi-web/server.mjs', 'utf8')
for (const kw of ['public', 'static', 'dist']) {
  let i = -1
  while ((i = s.indexOf(kw, i + 1)) >= 0) {
    const line = s.slice(Math.max(0, s.lastIndexOf('\n', i) + 1), s.indexOf('\n', i))
    if (line.includes('dir') || line.includes('serve') || line.includes('path') || line.includes('join')) console.log('  ' + line.trim())
    if (i > 60000) break
  }
}
