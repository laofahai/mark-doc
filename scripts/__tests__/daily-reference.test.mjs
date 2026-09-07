import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const script = fileURLToPath(new URL('../test-daily-reference.py', import.meta.url))

test('daily reference is reproducible and matches shared presentation settings', () => {
  const result = spawnSync('python3', ['-B', script, '--reference-only'], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`)
})

const pandoc = spawnSync('pandoc', ['--version'], { encoding: 'utf8' })
test('actual Pandoc export retains the daily styles', { skip: pandoc.status !== 0 ? 'Pandoc is not installed' : false }, () => {
  const result = spawnSync('python3', ['-B', script], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`)
})
