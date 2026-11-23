"use client";

import { create } from "zustand";

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  revision: string;
  language: string;
  dirty: boolean;
  saving: boolean;
}

export interface Diagnostic {
  file: string;
  line: number;
  col?: number;
  severity: "error" | "warning" | "note" | "info";
  message: string;
}

export interface OutputLine {
  stream: "stdout" | "stderr" | "system";
  text: string;
}

type Panel = "terminal" | "output" | "problems" | null;

interface WorkbenchState {
  files: OpenFile[];
  activePath: string | null;
  panel: Panel;
  theme: "dark" | "light";
  sandboxStatus: "idle" | "compiling" | "running";
  diagnostics: Diagnostic[];
  output: OutputLine[];
  cursor: { line: number; col: number };
  sidebarOpen: boolean;

  openFile: (f: OpenFile) => void;
  closeFile: (path: string) => void;
  setActive: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  markSaved: (path: string, revision: string) => void;
  setDirty: (path: string, dirty: boolean) => void;
  setPanel: (p: Panel) => void;
  togglePanel: (p: Exclude<Panel, null>) => void;
  setTheme: (t: "dark" | "light") => void;
  setSandboxStatus: (s: WorkbenchState["sandboxStatus"]) => void;
  setDiagnostics: (d: Diagnostic[]) => void;
  appendOutput: (stream: OutputLine["stream"], text: string) => void;
  clearOutput: () => void;
  setCursor: (line: number, col: number) => void;
  setSidebarOpen: (v: boolean) => void;
}

export const useWorkbench = create<WorkbenchState>((set) => ({
  files: [],
  activePath: null,
  panel: null,
  theme: "dark",
  sandboxStatus: "idle",
  diagnostics: [],
  output: [],
  cursor: { line: 1, col: 1 },
  sidebarOpen: true,

  openFile: (f) =>
    set((s) => {
      const existing = s.files.find((x) => x.path === f.path);
      if (existing) return { activePath: f.path };
      return {
        files: [...s.files, { ...f, dirty: false, saving: false }],
        activePath: f.path,
      };
    }),
  closeFile: (path) =>
    set((s) => {
      const files = s.files.filter((f) => f.path !== path);
      const activePath =
        s.activePath === path ? (files[files.length - 1]?.path ?? null) : s.activePath;
      return { files, activePath };
    }),
  setActive: (path) => set({ activePath: path }),
  updateContent: (path, content) =>
    set((s) => ({
      files: s.files.map((f) => (f.path === path ? { ...f, content, dirty: true } : f)),
    })),
  markSaved: (path, revision) =>
    set((s) => ({
      files: s.files.map((f) =>
        f.path === path ? { ...f, revision, dirty: false, saving: false } : f,
      ),
    })),
  setDirty: (path, dirty) =>
    set((s) => ({
      files: s.files.map((f) => (f.path === path ? { ...f, dirty } : f)),
    })),
  setPanel: (p) => set({ panel: p }),
  togglePanel: (p) => set((s) => ({ panel: s.panel === p ? null : p })),
  setTheme: (t) => set({ theme: t }),
  setSandboxStatus: (sandboxStatus) => set({ sandboxStatus }),
  setDiagnostics: (diagnostics) => set({ diagnostics }),
  appendOutput: (stream, text) =>
    set((s) => ({
      output: [...s.output.slice(-2000), { stream, text }],
    })),
  clearOutput: () => set({ output: [] }),
  setCursor: (line, col) => set({ cursor: { line, col } }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}));
