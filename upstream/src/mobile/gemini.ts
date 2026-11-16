import type { CreateMessageRequest, MessageStreamEvent } from "../services/api/types.js";
import { readServerSentEvents } from "../services/api/sse.js";
import { useMobile } from "./state.js";

// Convert native Gemini text chunks into the shared chat UI event format.
// This first version supports text conversations; DeepSeek handles file and voice tools.
export async function* streamGemini(
  body: CreateMessageRequest,
  signal: AbortSignal,
): AsyncGenerator<MessageStreamEvent> {
  const { geminiKey } = useMobile.getState();
  if (!geminiKey) {
    throw new Error("请先在「API 连接」中填写 Gemini API Key");
  }
  const contents = body.messages
    .map((m) => {
      const blocks =
        typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
      if (blocks.some((b) => b.type === "image" || b.type === "document")) {
        throw new Error("Gemini 当前版本支持文字会话；含附件的对话请使用 DeepSeek。");
      }
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts: blocks
          .filter((b) => b.type === "text")
          .map((b) => ({ text: (b as { text: string }).text })),
      };
    })
    .filter((m) => m.parts.length);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(body.model)}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: body.system }] }, contents }),
      signal,
    },
  );
  if (!response.ok) {
    let msg = `Gemini HTTP ${response.status}`;
    try {
      msg = (await response.json()).error?.message || msg;
    } catch {
      /* Keep the HTTP status if the response is not JSON. */
    }
    throw new Error(msg);
  }
  if (!response.body) {
    throw new Error("Gemini 未返回数据流");
  }
  yield { type: "message_start", message: { id: crypto.randomUUID(), model: body.model } };
  yield { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } };
  let usage: import("../services/api/types.js").MessageUsage | undefined;
  let finished = false;
  let reason: "end_turn" | "max_tokens" | "refusal" = "end_turn";
  for await (const e of readServerSentEvents(response.body, signal)) {
    const data = JSON.parse(e.data);
    if (data.error) {
      throw new Error(data.error.message || "Gemini 请求失败");
    }
    if (data.promptFeedback?.blockReason) {
      reason = "refusal";
      finished = true;
    }
    if (data.usageMetadata && Number.isFinite(data.usageMetadata.promptTokenCount)) {
      const metadata = data.usageMetadata;
      const total = Math.max(0, Math.floor(metadata.promptTokenCount));
      const cached = Math.min(
        total,
        Math.max(0, Math.floor(metadata.cachedContentTokenCount || 0)),
      );
      usage = {
        input_tokens: total - cached,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: cached,
        output_tokens: Math.max(
          0,
          Math.floor((metadata.candidatesTokenCount || 0) + (metadata.thoughtsTokenCount || 0)),
        ),
      };
    }
    const candidate = data.candidates?.[0];
    for (const part of candidate?.content?.parts || []) {
      if (part.text && !part.thought) {
        yield {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: part.text },
        };
      }
    }
    if (candidate?.finishReason) {
      finished = true;
      reason =
        candidate.finishReason === "MAX_TOKENS"
          ? "max_tokens"
          : ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"].includes(
                candidate.finishReason,
              )
            ? "refusal"
            : "end_turn";
    }
  }
  if (!finished) {
    throw new Error("Gemini 连接提前结束，回答可能不完整");
  }
  yield { type: "content_block_stop", index: 0 };
  yield {
    type: "message_delta",
    delta: { stop_reason: reason, stop_sequence: null },
    ...(usage ? { usage } : {}),
  };
  yield { type: "message_stop" };
}
