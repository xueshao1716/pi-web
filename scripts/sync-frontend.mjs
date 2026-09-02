import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Copy one built frontend tree to each runtime's static asset directory.
 * Targets are cleared first so stale hashed assets cannot survive a rebuild.
 */
export async function syncFrontend({
  sourceDir = path.join(REPO_ROOT, 'frontend', 'dist'),
  targets = [path.join(REPO_ROOT, 'public'), path.join(REPO_ROOT, 'app', 'dist')],
} = {}) {
  const source = path.resolve(sourceDir)
  const sourceStat = await fs.stat(source).catch(() => null)
  if (!sourceStat?.isDirectory()) throw new Error(`Frontend build directory not found: ${source}`)

  for (const targetDir of targets) {
    const target = path.resolve(targetDir)
    await fs.rm(target, { recursive: true, force: true })
    await fs.mkdir(target, { recursive: true })
    await fs.cp(source, target, { recursive: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await syncFrontend()
  console.log('Frontend build synced to public/ and app/dist/')
}
