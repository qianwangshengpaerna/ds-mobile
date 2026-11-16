import type { Plugin } from "./state.js";
export type McpTool = { name: string; description?: string; inputSchema?: Record<string, unknown> };
const sessions = new Map<string, string>();
const initialized = new Set<string>();
type RpcResult = { tools?: McpTool[]; nextCursor?: string; [key: string]: unknown };
type RpcResponse = { id?: string; error?: { message?: string }; result: RpcResult };
async function rpc(
  plugin: Plugin,
  method: string,
  params: unknown,
  notify = false,
): Promise<RpcResult> {
  const url = new URL(plugin.url);
  if (url.protocol !== "https:") {
    throw new Error("插件地址必须使用 HTTPS");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(url.href, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(plugin.token ? { Authorization: `Bearer ${plugin.token}` } : {}),
        ...(sessions.has(plugin.id) ? { "Mcp-Session-Id": sessions.get(plugin.id) || "" } : {}),
        ...(initialized.has(plugin.id) ? { "MCP-Protocol-Version": "2025-03-26" } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        ...(notify ? {} : { id: crypto.randomUUID() }),
        method,
        params,
      }),
    });
    if (!response.ok) {
      if (response.status === 404) {
        initialized.delete(plugin.id);
        sessions.delete(plugin.id);
      }
      throw new Error(`插件 HTTP ${response.status}`);
    }
    const session = response.headers.get("Mcp-Session-Id");
    if (session) {
      sessions.set(plugin.id, session);
    }
    if (notify) {
      return {};
    }
    let data: RpcResponse | undefined;
    if (response.headers.get("Content-Type")?.includes("text/event-stream")) {
      const { readServerSentEvents } = await import("../services/api/sse.js");
      if (!response.body) {
        throw new Error("插件未返回数据");
      }
      for await (const event of readServerSentEvents(response.body, controller.signal)) {
        const item = JSON.parse(event.data);
        if (item.id !== undefined) {
          data = item;
          break;
        }
      }
    } else {
      data = await response.json();
    }
    if (!data) {
      throw new Error("插件未返回 JSON-RPC 结果");
    }
    if (data.error) {
      throw new Error(data.error.message || "插件调用失败");
    }
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}
export async function listTools(plugin: Plugin): Promise<McpTool[]> {
  if (!initialized.has(plugin.id)) {
    await rpc(plugin, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "ds mobile", version: "0.2.0" },
    });
    initialized.add(plugin.id);
    await rpc(plugin, "notifications/initialized", {}, true);
  }
  const tools: McpTool[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const result = await rpc(plugin, "tools/list", cursor ? { cursor } : {});
    tools.push(...(result.tools || []));
    cursor = result.nextCursor;
    if (!cursor) {
      return tools;
    }
  }
  throw new Error("插件工具列表分页过多");
}
export const callTool = (plugin: Plugin, name: string, args: unknown) =>
  rpc(plugin, "tools/call", { name, arguments: args });
