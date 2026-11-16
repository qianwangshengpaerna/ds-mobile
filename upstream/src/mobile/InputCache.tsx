import { useChatStore } from "../services/chat/store.js";
import { getVisibleMessages } from "../services/chat/branches.js";
import type { Message } from "../services/chat/types.js";
export function cacheStats(messages: Message[]) {
  const reply = messages
    .filter((m) => m.role === "assistant" && m.usage && m.status === "done")
    .at(-1);
  if (!reply || reply.role !== "assistant" || !reply.usage) {
    return null;
  }
  const usage = reply.usage;
  const valid = (n: number) => (Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);
  const hit = valid(usage.cache_read_input_tokens);
  const created = valid(usage.cache_creation_input_tokens);
  const fresh = valid(usage.input_tokens);
  const total = hit + created + fresh;
  return {
    total,
    hit,
    fresh,
    created,
    rate: total ? (hit / total) * 100 : 0,
    model: reply.model || "历史模型",
  };
}
export function InputCache({ sessionId }: { sessionId: string | null }) {
  const session = useChatStore((s) => (sessionId ? s.sessionCache[sessionId] : undefined));
  const stats = cacheStats(session ? getVisibleMessages(session) : []);
  return (
    <div
      className="ds-input-cache"
      aria-live="polite"
      title="显示最近一次完成请求的接口用量。联网请求可能包含多步输入；这不代表当前上下文占用或缓存仍然保留。"
    >
      {stats ? (
        <>
          <span>最近请求 · 输入 {stats.total.toLocaleString()}</span>
          <span>
            缓存命中 {stats.hit.toLocaleString()} · {stats.rate.toFixed(1)}%
          </span>
          <span className="ds-cache-unit">tokens</span>
        </>
      ) : (
        <span>输入缓存：{session ? "暂无接口用量，发送后更新" : "发送后显示实际命中"}</span>
      )}
    </div>
  );
}
