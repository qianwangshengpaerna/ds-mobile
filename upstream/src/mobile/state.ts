import type { ModelOption } from "./models.js";
import { create } from "zustand";
export type Project = { id: string; name: string; instruction: string };
export type Plugin = { id: string; name: string; url: string; token: string };
type MobileState = {
  provider: "deepseek" | "gemini";
  geminiKey: string;
  geminiModel: string;
  deepseekModel: string;
  deepseekModels: ModelOption[];
  geminiModels: ModelOption[];
  projects: Project[];
  selected: string;
  assignments: Record<string, string>;
  plugins: Plugin[];
  panel: "" | "projects" | "api" | "plugins" | "documents";
};
const defaults: MobileState = {
  provider: "deepseek",
  geminiKey: "",
  geminiModel: "gemini-2.5-flash",
  deepseekModel: "deepseek-flash",
  deepseekModels: [],
  geminiModels: [],
  projects: [],
  selected: "",
  assignments: {},
  plugins: [],
  panel: "",
};
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem("ds-mobile:config") || "{}");
} catch {
  /* fresh install */
}
export const useMobile = create<MobileState>(() => ({ ...defaults, ...saved, panel: "" }));
export const updateMobile = (patch: Partial<MobileState>) => {
  useMobile.setState(patch);
  const data = { ...useMobile.getState(), panel: "" };
  localStorage.setItem("ds-mobile:config", JSON.stringify(data));
};
export const currentModel = () => {
  const s = useMobile.getState();
  return s.provider === "gemini" ? s.geminiModel : s.deepseekModel;
};
export const assignSession = (id: string) => {
  const s = useMobile.getState();
  if (s.selected) {
    updateMobile({ assignments: { ...s.assignments, [id]: s.selected } });
  }
};
export const projectInstruction = (id: string) => {
  const s = useMobile.getState();
  return s.projects.find((p) => p.id === s.assignments[id])?.instruction || "";
};
export const openMobilePanel = (panel: MobileState["panel"]) => updateMobile({ panel });
