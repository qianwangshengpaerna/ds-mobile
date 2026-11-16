import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { createDocument, safeDocumentName, type DocumentFormat } from "./documentFormats.js";
import { saveBlob } from "./files.js";
import { ExportLocation } from "./ExportLocation.js";
import { useMobile, currentModel, openMobilePanel, projectInstruction } from "./state.js";
import { useSettings } from "../services/settings.js";
import { useChatStore } from "../services/chat/store.js";
import { getVisibleMessages } from "../services/chat/branches.js";
import { streamMessage } from "../services/api/client.js";
const useDocumentDraft = create(() => ({
  format: "docx" as DocumentFormat,
  title: "我的文档",
  content: "",
  requirement: "",
}));
export function DocumentStudio() {
  const draft = useDocumentDraft();
  const model = currentModel();
  const provider = useMobile((s) => s.provider);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const fromChat = () => {
    const state = useChatStore.getState();
    const session = state.activeId ? state.sessionCache[state.activeId] : null;
    const last = session
      ? getVisibleMessages(session)
          .filter((m) => m.role === "assistant")
          .at(-1)
      : null;
    if (!last || last.role !== "assistant") {
      setNotice("请先打开包含回答的对话。");
      return;
    }
    const text = last.blocks
      .flatMap((b) => (b.type === "text" && !b.isTemplate ? [b.text] : []))
      .join("\n\n");
    if (!text.trim()) {
      setNotice("当前回答没有可导出的正文。");
      return;
    }
    useDocumentDraft.setState({ content: text, title: session?.title || "聊天文档" });
    setNotice("已填入当前对话的最后一条回答，可继续编辑。");
  };
  const generate = async () => {
    const key =
      provider === "deepseek" ? useSettings.getState().apiKey : useMobile.getState().geminiKey;
    if (!key) {
      setNotice("请先配置 API 连接。");
      openMobilePanel("api");
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setNotice("模型正在生成内容…");
    useDocumentDraft.setState({ content: "" });
    let text = "";
    try {
      const state = useChatStore.getState();
      const instruction = state.activeId ? projectInstruction(state.activeId) : "";
      const format =
        draft.format === "xlsx"
          ? "输出一个 TSV 表格，第一行为列名，单元格之间用制表符，不要代码围栏，不要表格以外的解释。"
          : "输出适合正式文档的 Markdown 正文，使用清晰的标题和段落，不要包裹代码围栏。";
      for await (const event of streamMessage(
        useSettings.getState().apiKey || "",
        {
          model,
          system: `你是文档制作助手。${format}\n${instruction}`,
          messages: [
            { role: "user", content: `文档标题：${draft.title}\n制作需求：${draft.requirement}` },
          ],
          thinking: { type: "disabled" },
          tools: [],
          safety_check: { level: "high" },
        },
        abort.signal,
      )) {
        if (event.type === "content_block_start" && event.content_block.type === "text") {
          text += event.content_block.text;
        }
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          text += event.delta.text;
        }
        if (event.type === "message_delta" && event.delta.stop_reason === "refusal") {
          throw new Error("模型未能生成此内容，请调整制作需求。");
        }
        if (text.length > 200000) {
          abort.abort();
          throw new Error("文档超出 200000 字符限制，请缩小制作范围。");
        }
        useDocumentDraft.setState({ content: text });
      }
      setNotice("内容已生成，请检查并编辑后保存文件。");
    } catch (e) {
      setNotice(
        abort.signal.aborted
          ? "已停止生成，可编辑已有内容。"
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      controller.current = null;
      setBusy(false);
    }
  };
  return (
    <>
      <p className="ds-muted">
        内置文档插件在本机制作 DOCX、XLSX、PDF。可从聊天提取正文，或使用 {model}{" "}
        生成内容；模型生成会使用 API 额度。
      </p>
      <label>
        文档类型
        <select
          value={draft.format}
          onChange={(e) => useDocumentDraft.setState({ format: e.target.value as DocumentFormat })}
        >
          <option value="docx">Word 文档（.docx）</option>
          <option value="xlsx">Excel 表格（.xlsx）</option>
          <option value="pdf">PDF 文档（.pdf）</option>
        </select>
      </label>
      <label>
        文档标题 / 文件名
        <input
          value={draft.title}
          maxLength={100}
          onChange={(e) => useDocumentDraft.setState({ title: e.target.value })}
        />
      </label>
      <label>
        制作需求
        <textarea
          rows={3}
          value={draft.requirement}
          onChange={(e) => useDocumentDraft.setState({ requirement: e.target.value })}
          placeholder="例如：制作一份为期四周的英语学习计划"
        />
      </label>
      <div className="ds-actions">
        <button className="ds-outline" disabled={busy} onClick={fromChat}>
          从当前回答填入
        </button>
        <button
          className="ds-primary"
          disabled={busy || !draft.requirement.trim()}
          onClick={() => void generate()}
        >
          用所选模型生成
        </button>
      </div>
      {controller.current && (
        <button className="ds-outline" onClick={() => controller.current?.abort()}>
          停止生成
        </button>
      )}
      <label>
        {draft.format === "xlsx" ? "表格内容（TSV / CSV / Markdown 表格）" : "文档正文（可编辑）"}
        <textarea
          rows={9}
          value={draft.content}
          onChange={(e) => useDocumentDraft.setState({ content: e.target.value })}
          placeholder={
            draft.format === "xlsx"
              ? "任务\t负责人\t截止时间\n需求整理\t小王\t周一"
              : "在这里填写正文，或先生成内容…"
          }
        />
      </label>
      <p className="ds-muted">
        Word 保留标题与段落；Excel 会识别表格并冻结首行；PDF
        自动换行和分页，支持常用中文。请在保存前核对内容。
      </p>
      <button
        className="ds-primary"
        disabled={busy || !draft.content.trim()}
        onClick={async () => {
          setBusy(true);
          setNotice("正在制作文件…");
          try {
            const blob = await createDocument(draft.format, draft.title, draft.content);
            const result = await saveBlob(safeDocumentName(draft.title, draft.format), blob);
            setNotice(
              result.cancelled
                ? "已取消保存"
                : `文件已保存：${result.label || safeDocumentName(draft.title, draft.format)}`,
            );
          } catch (e) {
            setNotice(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        制作并保存到本地
      </button>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      <ExportLocation />
    </>
  );
}
