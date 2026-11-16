import { useState } from "react";
import { nativeFiles, type ExportDirectory } from "./files.js";
export function ExportLocation() {
  const bridge = nativeFiles();
  const [directory, setDirectory] = useState<ExportDirectory>(
    () => bridge?.directory() || { mode: "ask", label: "每次选择保存位置" },
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <section className="ds-export">
      <h3>导出位置</h3>
      <p className="ds-muted">
        {directory.mode === "folder" ? "默认文件夹：" : "保存方式："}
        {directory.label}
      </p>
      <p className="ds-muted">
        文档、表格、PDF 和聊天备份使用此位置。请选择系统允许访问的文件夹；同名文件会另存，不覆盖。
      </p>
      <button
        className="ds-outline"
        disabled={!bridge || busy}
        onClick={async () => {
          if (!bridge) {
            return;
          }
          setBusy(true);
          try {
            const result = await bridge.chooseDirectory();
            setDirectory(bridge.directory());
            setNotice(result.cancelled ? "已取消选择" : "导出文件夹已保存");
          } catch (e) {
            setNotice(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "正在选择…" : "选择导出文件夹"}
      </button>
      {directory.mode === "folder" && (
        <button
          className="ds-outline"
          onClick={() => {
            bridge?.resetDirectory();
            setDirectory({ mode: "ask", label: "每次选择保存位置" });
            setNotice("已恢复每次选择");
          }}
        >
          恢复每次询问
        </button>
      )}
      {!bridge && (
        <p className="ds-muted">在 Android 应用中可指定文件夹，浏览器版使用浏览器的下载设置。</p>
      )}
      <p role="status">{notice}</p>
    </section>
  );
}
