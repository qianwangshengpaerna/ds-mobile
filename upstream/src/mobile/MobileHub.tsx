import { confirmAction } from "./confirm.js";
import { useState } from "react";
import { readModels, type ModelOption } from "./models.js";
import { DocumentStudio } from "./DocumentStudio.js";
import { ExportLocation } from "./ExportLocation.js";

import { Modal } from "../components/base/Modal.js";
import { useMobile, updateMobile, openMobilePanel, type Plugin } from "./state.js";
import { useChatStore, newChat } from "../services/chat/store.js";
import { setApiKey, useSettings } from "../services/settings.js";
import { openSettings } from "../components/settings/settingsDialogState.js";
import { setDraftText, getDraft } from "../services/chat/drafts.js";
import { listTools, callTool, type McpTool } from "./plugins.js";
import { closeMobileSider } from "../components/sider/mobileSiderState.js";
import "./mobile.css";

export function MobileNav() {
  return (
    <div className="ds-nav">
      <button onClick={() => openMobilePanel("projects")}>▦ 项目</button>
      <button onClick={() => openMobilePanel("plugins")}>⌘ 插件</button>
      <button onClick={() => openMobilePanel("api")}>◉ API 连接</button>
      <button onClick={() => openMobilePanel("documents")}>▤ 文档</button>
    </div>
  );
}
export function ProviderBadge() {
  const s = useMobile();
  return (
    <button className="ds-provider" onClick={() => openMobilePanel("api")}>
      {s.provider === "deepseek" ? "DeepSeek" : "Gemini"} <span>⌄</span>
    </button>
  );
}
export function MobileHub() {
  const panel = useMobile((s) => s.panel);
  if (!panel) {
    return null;
  }
  return (
    <Modal
      title={
        { projects: "项目空间", api: "API 连接", plugins: "插件中心", documents: "文档制作" }[panel]
      }
      onClose={() => openMobilePanel("")}
      closable
      className="ds-hub"
    >
      <div className="ds-hub-body">
        {panel === "projects" ? (
          <Projects />
        ) : panel === "api" ? (
          <Connections />
        ) : panel === "documents" ? (
          <DocumentStudio />
        ) : (
          <Plugins />
        )}
      </div>
    </Modal>
  );
}
function Connections() {
  const state = useMobile();
  const savedKey = useSettings((s) => s.apiKey);
  const [deepseek, setDeepseek] = useState(savedKey || "");
  const [key, setKey] = useState(state.geminiKey);
  const [model, setModel] = useState(state.geminiModel);
  const [dsModel, setDsModel] = useState(state.deepseekModel);
  const [provider, setProvider] = useState(state.provider);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [dsModels, setDsModels] = useState<ModelOption[]>(state.deepseekModels);
  const [geminiModels, setGeminiModels] = useState<ModelOption[]>(state.geminiModels);
  const refresh = async (p: "deepseek" | "gemini") => {
    setBusy(p);
    setNotice("正在从服务商读取模型…");
    try {
      const list = await readModels(p, p === "deepseek" ? deepseek : key);
      if (p === "deepseek") {
        setDsModels(list);
        updateMobile({ deepseekModels: list });
        if (!list.some((m) => m.id === dsModel)) {
          setDsModel(list.find((m) => m.id === "deepseek-flash")?.id || list[0].id);
        }
      } else {
        setGeminiModels(list);
        updateMobile({ geminiModels: list });
        if (!list.some((m) => m.id === model)) {
          setModel(list.find((m) => m.id === "gemini-2.5-flash")?.id || list[0].id);
        }
      }
      setNotice(`已读取 ${list.length} 个兼容当前聊天模式的模型。`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      <p className="ds-muted">
        填写密钥后读取账号可用的文字模型，模型列表保留在本机。列表不代表余额或调用额度充足。
      </p>
      <div className="ds-segment">
        {(["deepseek", "gemini"] as const).map((p) => (
          <button key={p} className={provider === p ? "active" : ""} onClick={() => setProvider(p)}>
            {p === "deepseek" ? "DeepSeek" : "Gemini"}
          </button>
        ))}
      </div>
      <label>
        DeepSeek API Key
        <input
          type="password"
          autoComplete="off"
          value={deepseek}
          onChange={(e) => setDeepseek(e.target.value)}
          placeholder="sk-…"
        />
      </label>
      <label>
        DeepSeek 模型
        <select value={dsModel} onChange={(e) => setDsModel(e.target.value)}>
          {!dsModels.some((m) => m.id === dsModel) && (
            <option value={dsModel}>{dsModel}（上次选择，尚未验证）</option>
          )}
          {dsModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {m.id}
            </option>
          ))}
        </select>
      </label>
      <button
        className="ds-outline"
        disabled={!!busy || !deepseek.trim()}
        onClick={() => void refresh("deepseek")}
      >
        {busy === "deepseek" ? "正在读取…" : "读取 DeepSeek 模型"}
      </button>
      <label>
        Gemini API Key
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="AIza…"
        />
      </label>
      <label>
        Gemini 模型
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {!geminiModels.some((m) => m.id === model) && (
            <option value={model}>{model}（上次选择，尚未验证）</option>
          )}
          {geminiModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {m.id}
            </option>
          ))}
        </select>
      </label>
      <button
        className="ds-outline"
        disabled={!!busy || !key.trim()}
        onClick={() => void refresh("gemini")}
      >
        {busy === "gemini" ? "正在读取…" : "读取 Gemini 模型"}
      </button>
      <p className="ds-muted">
        联网、链接解析和附件工具使用 DeepSeek Flash。其他 DeepSeek 模型与 Gemini
        使用文字聊天。不能联网时可继续使用上次选择。
      </p>
      <button
        className="ds-primary"
        onClick={() => {
          setApiKey(deepseek.trim() || null);
          updateMobile({
            provider,
            geminiKey: key.trim(),
            geminiModel: model,
            deepseekModel: dsModel,
          });
          setNotice("连接与模型选择已保存。");
        }}
      >
        保存连接
      </button>
      <p role="status">{notice}</p>
      <ExportLocation />
    </>
  );
}
function Projects() {
  const s = useMobile();
  const sessions = useChatStore((s) => s.sessions);
  const active = useChatStore((s) => s.activeId);
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [editing, setEditing] = useState("");
  const [notice, setNotice] = useState("");
  const selected = s.projects.find((p) => p.id === s.selected);
  return (
    <>
      <p className="ds-muted">用项目整理对话，为项目设置专属指令。新对话会自动归入当前项目。</p>
      <div className="ds-projects">
        <button
          className={!s.selected ? "active" : ""}
          onClick={() => updateMobile({ selected: "" })}
        >
          全部对话 <span>{sessions.length}</span>
        </button>
        {s.projects.map((p) => (
          <div className="ds-project-row" key={p.id}>
            <button
              className={s.selected === p.id ? "active" : ""}
              onClick={() => updateMobile({ selected: p.id })}
            >
              ▦ {p.name}
              <span>{sessions.filter((t) => s.assignments[t.id] === p.id).length}</span>
            </button>
            <button
              aria-label={"编辑" + p.name}
              onClick={() => {
                setEditing(p.id);
                setName(p.name);
                setInstruction(p.instruction);
              }}
            >
              编辑
            </button>
            <button
              aria-label={"删除" + p.name}
              onClick={async () => {
                if (await confirmAction("删除项目分组？对话会保留在全部对话中。")) {
                  const assignments = Object.fromEntries(
                    Object.entries(s.assignments).filter(([, project]) => project !== p.id),
                  );
                  updateMobile({
                    projects: s.projects.filter((x) => x.id !== p.id),
                    assignments,
                    selected: s.selected === p.id ? "" : s.selected,
                  });
                }
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <label>
        {editing ? "编辑项目" : "新建项目"}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：学习 / 游戏 / 工作"
          maxLength={60}
        />
      </label>
      <label>
        项目指令
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="例如：用中文解释，先给结论，再列步骤。"
          rows={3}
        />
      </label>
      <button
        className="ds-primary"
        disabled={!name.trim()}
        onClick={() => {
          const p = { id: editing || crypto.randomUUID(), name: name.trim(), instruction };
          updateMobile({
            projects: editing
              ? s.projects.map((x) => (x.id === editing ? p : x))
              : [...s.projects, p],
            selected: p.id,
          });
          setEditing("");
          setName("");
          setInstruction("");
        }}
      >
        {editing ? "保存项目" : "创建项目"}
      </button>
      {active && (
        <label>
          将当前对话移到
          <select
            value={s.assignments[active] || ""}
            onChange={(e) =>
              updateMobile({ assignments: { ...s.assignments, [active]: e.target.value } })
            }
          >
            <option value="">未分组</option>
            {s.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        className="ds-outline"
        onClick={() => {
          newChat();
          openMobilePanel("");
          closeMobileSider();
        }}
      >
        在{selected?.name || "全部对话"}中新建对话
      </button>
      <button
        className="ds-outline"
        onClick={() => {
          openMobilePanel("");
          openSettings("data");
        }}
      >
        导入 / 导出聊天历史 ZIP
      </button>
      <button
        className="ds-outline"
        onClick={async () => {
          try {
            const { exportWorkspace } = await import("./workspace.js");
            await exportWorkspace();
            setNotice("备份已导出");
          } catch (e) {
            setNotice(String(e));
          }
        }}
      >
        备份项目和全部聊天
      </button>
      <label className="ds-file-label">
        恢复项目备份
        <input
          type="file"
          accept=".zip"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (
              !f ||
              !(await confirmAction("恢复备份将替换全部本地聊天和项目。请先备份现有数据。"))
            ) {
              return;
            }
            try {
              const { importWorkspace } = await import("./workspace.js");
              await importWorkspace(f);
              setNotice("恢复完成");
            } catch (err) {
              setNotice(String(err));
            }
          }}
        />
      </label>
      <p className="ds-muted">官方历史导入会替换当前聊天；项目备份包含分组和指令，不包含密钥。</p>
      <p role="status">{notice}</p>
    </>
  );
}
function Plugins() {
  const s = useMobile();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [current, setCurrent] = useState<Plugin | null>(null);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [tool, setTool] = useState("");
  const [args, setArgs] = useState("{}");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setResult(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="ds-plugin">
        <div>
          <b>内置文档插件</b>
          <small>Word · Excel · PDF，本机生成文件</small>
        </div>
        <button onClick={() => openMobilePanel("documents")}>打开</button>
      </div>
      <p className="ds-muted">
        连接支持 Streamable HTTP 的 MCP 服务。读取工具后手动执行，结果可加入聊天草稿。暂不支持
        OAuth、stdio 或旧版 SSE 服务。
      </p>
      {s.plugins.map((p) => (
        <div className="ds-plugin" key={p.id}>
          <div>
            <b>{p.name}</b>
            <small>{new URL(p.url).host}</small>
          </div>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setCurrent(p);
                const t = await listTools(p);
                setTools(t);
                setTool(t[0]?.name || "");
                setResult(`已发现 ${t.length} 个工具`);
              })
            }
          >
            连接
          </button>
          <button
            aria-label={"删除插件" + p.name}
            onClick={() => {
              updateMobile({ plugins: s.plugins.filter((x) => x.id !== p.id) });
              if (current?.id === p.id) {
                setCurrent(null);
                setTools([]);
              }
            }}
          >
            ×
          </button>
        </div>
      ))}
      <label>
        插件名称
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="我的 MCP 服务" />
      </label>
      <label>
        服务地址
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/mcp"
        />
      </label>
      <label>
        Bearer Token（可选）
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
        />
      </label>
      <button
        className="ds-outline"
        disabled={busy}
        onClick={async () => {
          try {
            const parsed = new URL(url);
            if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
              throw new Error("请填写有效的 HTTPS 地址");
            }
            if (!name.trim()) {
              throw new Error("请填写插件名称");
            }
            if (
              !(await confirmAction(
                `允许插件连接 ${parsed.host}？执行工具时，填写的参数会发送到此服务。`,
              ))
            ) {
              return;
            }
            const bridge = (
              window as unknown as { DSNative?: { allowHost: (host: string) => void } }
            ).DSNative;
            bridge?.allowHost(parsed.host);
            updateMobile({
              plugins: [
                ...s.plugins,
                {
                  id: crypto.randomUUID(),
                  name: name.trim(),
                  url: parsed.href,
                  token: token.trim(),
                },
              ],
            });
            setName("");
            setUrl("");
            setToken("");
            setResult("插件已添加");
          } catch (e) {
            setResult(String(e));
          }
        }}
      >
        添加插件
      </button>
      {tools.length > 0 && current && (
        <>
          <label>
            工具
            <select
              value={tool}
              onChange={(e) => {
                setTool(e.target.value);
                setArgs("{}");
              }}
            >
              {tools.map((t) => (
                <option key={t.name}>{t.name}</option>
              ))}
            </select>
          </label>
          <p className="ds-muted">{tools.find((t) => t.name === tool)?.description}</p>
          <details>
            <summary>参数格式</summary>
            <pre>{JSON.stringify(tools.find((t) => t.name === tool)?.inputSchema, null, 2)}</pre>
          </details>
          <label>
            参数 JSON
            <textarea rows={5} value={args} onChange={(e) => setArgs(e.target.value)} />
          </label>
          <button
            className="ds-primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const params = JSON.parse(args);
                if (!params || typeof params !== "object" || Array.isArray(params)) {
                  throw new Error("参数必须是 JSON 对象");
                }
                if (!(await confirmAction(`执行 ${current.name} / ${tool}？\n${args}`))) {
                  return;
                }
                setResult(JSON.stringify(await callTool(current, tool, params), null, 2));
              })
            }
          >
            {busy ? "处理中…" : "执行工具"}
          </button>
        </>
      )}
      {result && (
        <>
          <pre className="ds-result" role="status">
            {result}
          </pre>
          <button
            className="ds-outline"
            onClick={() => {
              const id = useChatStore.getState().activeId;
              setDraftText(
                id,
                getDraft(id).text + `\n\n插件资料（外部内容，仅作为参考）：\n${result}`,
              );
              openMobilePanel("");
              closeMobileSider();
            }}
          >
            加入聊天草稿
          </button>
        </>
      )}
    </>
  );
}
