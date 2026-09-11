import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGenerator } from 'unocss'
import config from '../uno.config.ts'

test('theme utility opacity is retained when colors are CSS variables', async () => {
  const uno = await createGenerator(config)
  const { css } = await uno.generate('bg-pi-accent/15 border-pi-border/50 text-pi-dim/60 hover:bg-pi-bg3/80')
  for (const [token, alpha] of [['accent',15], ['border',50], ['dim',60], ['bg3',80]]) {
    assert.ok(css.includes(`var(--pi-${token}) ${alpha}%`), `missing alpha for ${token}`)
  }
})

test('form fields explicitly use a solid border instead of native inset', async () => {
  const uno = await createGenerator(config)
  const { css } = await uno.generate('input-pi')
  assert.ok(css.includes('border-style:solid'))
})
