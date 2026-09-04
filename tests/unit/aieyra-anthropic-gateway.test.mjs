import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveAieyraRoute,
  anthropicToOpenAI,
  openAIToAnthropic,
  openAIChunkToAnthropic,
  createAieyraGatewayServer,
} from '../../engine/aieyra-anthropic-gateway.mjs';

const models = {
  'aieyra-gpt': { models: [{ id: 'gpt-5.5' }] },
  'aieyra-grok': { models: [{ id: 'grok-4.6' }] },
  'aieyra-claude': { models: [{ id: 'claude-sonnet-5' }] },
  'aieyra-gemini': { models: [{ id: 'gemini-3-flash' }] },
};

test('Aieyra 模型名前缀路由到对应池，并保留上游模型 ID', () => {
  assert.deepEqual(resolveAieyraRoute('aieyra-gpt/gpt-5.5', models), {
    provider: 'aieyra-gpt',
    model: 'gpt-5.5',
  });
  assert.deepEqual(resolveAieyraRoute('aieyra-gemini/gemini-3-flash', models), {
    provider: 'aieyra-gemini',
    model: 'gemini-3-flash',
  });
  assert.equal(resolveAieyraRoute('aieyra-gpt/not-in-store', models), null);
  assert.equal(resolveAieyraRoute('gpt-5.5', models), null);
});

test('Anthropic 请求转换为 OpenAI 请求，保留 system、历史和工具定义', () => {
  const result = anthropicToOpenAI({
    model: 'aieyra-gpt/gpt-5.5',
    system: '你是编码助手',
    max_tokens: 1200,
    messages: [
      { role: 'user', content: [{ type: 'text', text: '读取文件' }] },
      { role: 'assistant', content: [{ type: 'text', text: '我来读取。' }, { type: 'tool_use', id: 'call_1', name: 'Read', input: { file_path: 'a.txt' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '文件内容' }] },
    ],
    tools: [{ name: 'Read', description: '读文件', input_schema: { type: 'object', properties: { file_path: { type: 'string' } } } }],
  });

  assert.equal(result.model, 'gpt-5.5');
  assert.equal(result.max_tokens, 1200);
  assert.deepEqual(result.messages[0], { role: 'system', content: '你是编码助手' });
  assert.equal(result.messages[1].content, '读取文件');
  assert.equal(result.messages[2].tool_calls[0].id, 'call_1');
  assert.deepEqual(result.messages[3], { role: 'tool', tool_call_id: 'call_1', content: '文件内容' });
  assert.deepEqual(result.tools, [{ type: 'function', function: { name: 'Read', description: '读文件', parameters: { type: 'object', properties: { file_path: { type: 'string' } } } } }]);
});

test('OpenAI 工具调用响应转换为 Anthropic content blocks', () => {
  const result = openAIToAnthropic({
    id: 'chatcmpl_1', model: 'gpt-5.5', choices: [{
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        content: '准备读取',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'Read', arguments: '{"file_path":"a.txt"}' } }],
      },
    }],
    usage: { prompt_tokens: 10, completion_tokens: 7 },
  });

  assert.equal(result.type, 'message');
  assert.equal(result.stop_reason, 'tool_use');
  assert.deepEqual(result.content, [
    { type: 'text', text: '准备读取' },
    { type: 'tool_use', id: 'call_1', name: 'Read', input: { file_path: 'a.txt' } },
  ]);
  assert.deepEqual(result.usage, { input_tokens: 10, output_tokens: 7 });
});

test('OpenAI 流式 delta 转为 Claude content_block_delta 事件', () => {
  const result = openAIChunkToAnthropic({
    id: 'chatcmpl_1', model: 'gpt-5.5', choices: [{ delta: { content: '你好' }, finish_reason: null }],
  }, { contentIndex: 0 });
  assert.deepEqual(result, [{
    type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '你好' },
  }]);
});

test('HTTP 网关要求本机 token，并代理普通 Anthropic 请求', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aieyra-gateway-'));
  const authPath = join(dir, 'auth.json');
  const modelsPath = join(dir, 'models-store.json');
  await writeFile(authPath, JSON.stringify({ 'aieyra-gpt': { key: 'upstream-secret', baseUrl: 'https://upstream.test' } }));
  await writeFile(modelsPath, JSON.stringify({ 'aieyra-gpt': { models: [{ id: 'gpt-5.5', maxTokens: 8192 }] } }));
  let seen;
  const gateway = createAieyraGatewayServer({ authPath, modelsPath, token: 'local-test-token', fetchImpl: async (url, opts) => {
    seen = { url, opts: { ...opts, headers: { ...opts.headers, Authorization: '[redacted]' } } };
    return new Response(JSON.stringify({ id: 'x', model: 'gpt-5.5', choices: [{ message: { role: 'assistant', content: '已接通' }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 3 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }});
  await gateway.listen(0);
  const port = gateway.server.address().port;
  try {
    const denied = await fetch(`http://127.0.0.1:${port}/v1/messages`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
    assert.equal(denied.status, 401);
    const response = await fetch(`http://127.0.0.1:${port}/v1/messages?beta=true`, { method: 'POST', headers: { authorization: 'Bearer local-test-token', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'aieyra-gpt/gpt-5.5', max_tokens: 30, messages: [{ role: 'user', content: '你好' }] }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).content[0].text, '已接通');
    assert.equal(seen.url, 'https://upstream.test/v1/chat/completions');
    assert.match(seen.opts.body, /gpt-5\.5/);
    assert.doesNotMatch(seen.opts.body, /upstream-secret/);
  } finally {
    await gateway.close();
  }
});
