export type ModelOption = { id: string; name: string; description?: string };
export type Provider = "deepseek" | "gemini";
export async function readModels(
  provider: Provider,
  key: string,
  signal?: AbortSignal,
): Promise<ModelOption[]> {
  if (!key.trim()) {
    throw new Error("请先填写 API Key，再读取模型列表。");
  }
  const models: ModelOption[] = [];
  let cursor = "";
  const seen = new Set<string>();
  for (let page = 0; page < 30; page++) {
    const url =
      provider === "deepseek"
        ? "https://api.deepseek.com/models"
        : `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${cursor ? "&pageToken=" + encodeURIComponent(cursor) : ""}`;
    const response = await fetch(url, {
      headers:
        provider === "deepseek"
          ? { Authorization: `Bearer ${key.trim()}` }
          : { "x-goog-api-key": key.trim() },
      signal,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `读取模型失败（${response.status}）`);
    }
    if (provider === "deepseek") {
      if (!Array.isArray(data.data)) {
        throw new Error("DeepSeek 模型列表格式异常");
      }
      for (const item of data.data) {
        if (
          typeof item.id === "string" &&
          item.id.startsWith("deepseek-") &&
          (!Array.isArray(item.output_modalities) || item.output_modalities.includes("text"))
        ) {
          models.push({
            id: item.id,
            name: typeof item.name === "string" ? item.name : item.id,
            description: item.context_window
              ? `上下文 ${item.context_window.toLocaleString()} tokens`
              : undefined,
          });
        }
      }
      break;
    }
    if (!Array.isArray(data.models)) {
      throw new Error("Gemini 模型列表格式异常");
    }
    for (const item of data.models) {
      if (
        typeof item.name !== "string" ||
        !Array.isArray(item.supportedGenerationMethods) ||
        !item.supportedGenerationMethods.includes("generateContent")
      ) {
        continue;
      }
      const id = item.name.replace(/^models\//, "");
      if (
        !id.startsWith("gemini-") ||
        /(embedding|tts|live|native-audio|image|robotics|computer-use)/i.test(id)
      ) {
        continue;
      }
      models.push({
        id,
        name: typeof item.displayName === "string" ? item.displayName : id,
        description: typeof item.description === "string" ? item.description : undefined,
      });
    }
    cursor = typeof data.nextPageToken === "string" ? data.nextPageToken : "";
    if (!cursor) {
      break;
    }
    if (seen.has(cursor)) {
      throw new Error("模型列表分页异常");
    }
    seen.add(cursor);
    if (page === 29) {
      throw new Error("模型列表分页过多，请稍后重试");
    }
  }
  const unique = Array.from(new Map(models.map((m) => [m.id, m])).values());
  if (!unique.length) {
    throw new Error("账号未返回当前文字聊天模式可用的模型。");
  }
  return unique;
}
