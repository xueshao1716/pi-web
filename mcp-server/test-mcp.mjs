import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const tok = process.argv[2];
const transport = new StdioClientTransport({
  command: "node",
  args: ["D:/pi-web/mcp-server/index.mjs"],
  env: { ...process.env, PI_WEB_TOKEN: tok },
});
const client = new Client({ name: "test", version: "0.1" });
await client.connect(transport);
const tools = await client.listTools();
console.log("工具数:", tools.tools.length);
console.log("工具:", tools.tools.map(t => t.name).join(", "));
const res = await client.callTool({ name: "pi_list_sessions", arguments: {} });
console.log("会话前3:", res.content[0].text.split("\n").slice(0, 3));
// 测 chat（给小语发消息）
const chat = await client.callTool({ name: "pi_chat", arguments: { message: "用一句话介绍你自己" } });
console.log("pi_chat 回复:", chat.content[0].text.slice(0, 80));
process.exit(0);
