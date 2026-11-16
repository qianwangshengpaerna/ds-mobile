import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { exportHistory, importHistory } from "../services/chat/backup.js";
import { useMobile, updateMobile, type Project } from "./state.js";
export async function exportWorkspace() {
  const history = await exportHistory();
  const { projects, assignments } = useMobile.getState();
  const blob = new Blob(
    [
      zipSync({
        "workspace.json": strToU8(
          JSON.stringify({ format: "ds-mobile-workspace", version: 1, projects, assignments }),
        ),
        "history.zip": new Uint8Array(await history.blob.arrayBuffer()),
      }),
    ],
    { type: "application/zip" },
  );
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "ds-mobile-backup.zip";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 30000);
}
export async function importWorkspace(file: File) {
  if (file.size > 100 * 1024 * 1024) {
    throw new Error("项目备份上限 100 MB；大体积聊天请使用官方历史导入。");
  }
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (e) =>
      ["workspace.json", "history.zip"].includes(e.name) && e.originalSize <= 200 * 1024 * 1024,
  });
  if (!entries["workspace.json"] || !entries["history.zip"]) {
    throw new Error("不是完整的 ds mobile 项目备份");
  }
  const data = JSON.parse(strFromU8(entries["workspace.json"]));
  if (
    data.format !== "ds-mobile-workspace" ||
    data.version !== 1 ||
    !Array.isArray(data.projects) ||
    !data.assignments ||
    typeof data.assignments !== "object" ||
    Array.isArray(data.assignments)
  ) {
    throw new Error("不支持的项目备份格式");
  }
  const projects: Project[] = data.projects.map((p: Project) => {
    if (
      !p ||
      typeof p.id !== "string" ||
      typeof p.name !== "string" ||
      typeof p.instruction !== "string"
    ) {
      throw new Error("项目格式无效");
    }
    return { id: p.id, name: p.name, instruction: p.instruction };
  });
  if (new Set(projects.map((p) => p.id)).size !== projects.length) {
    throw new Error("项目 ID 重复");
  }
  const assignments: Record<string, string> = Object.fromEntries(
    Object.entries(data.assignments).filter(
      ([, v]) => typeof v === "string" && projects.some((p) => p.id === v),
    ),
  ) as Record<string, string>;
  await importHistory(
    new File([entries["history.zip"]], "history.zip", { type: "application/zip" }),
  );
  updateMobile({ projects, assignments, selected: "" });
}
