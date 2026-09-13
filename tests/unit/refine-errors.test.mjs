import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatRefineError } from '../../engine/refine-api.mjs'

test('经验沉淀错误应隐藏 Python 堆栈并说明额度/网络根因', () => {
  const error = formatRefineError('Traceback (most recent call last):\n  File "refine_proposal.py", line 123\nurllib.error.HTTPError: HTTP Error 402: Payment Required')
  assert.match(error, /上游模型额度不足|HTTP 402/)
  assert.doesNotMatch(error, /Traceback/)
  assert.doesNotMatch(error, /refine_proposal\.py.*line 123/)
})
