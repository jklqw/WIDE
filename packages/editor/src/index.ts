export const EXT_TO_LANGUAGE: Record<string, string> = {
  py: "python", pyw: "python",
  js: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", mts: "typescript",
  c: "c", h: "c",
  cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp",
  java: "java",
  go: "go",
  html: "html", htm: "html", css: "css", scss: "scss", less: "less",
  json: "json", md: "markdown", markdown: "markdown",
  yaml: "yaml", yml: "yaml", toml: "ini", ini: "ini",
  xml: "xml", sql: "sql", sh: "shell", bash: "shell", zsh: "shell",
  txt: "plaintext", env: "ini", gitignore: "ignore",
  dockerfile: "dockerfile", makefile: "makefile",
};

export function languageForFile(name: string): string {
  const base = name.split("/").pop() ?? name;
  const lower = base.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile") return "makefile";
  const ext = lower.includes(".") ? lower.split(".").pop()! : "";
  return EXT_TO_LANGUAGE[ext] ?? "plaintext";
}

export interface EditorTheme {
  base: "vs-dark" | "vs";
  inherit: boolean;
  rules: { token: string; foreground: string; fontStyle?: string }[];
  colors: Record<string, string>;
}

export const DARK_THEME: EditorTheme = {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#11141A",
    "editor.foreground": "#E6EDF3",
    "editor.lineHighlightBackground": "#1E242E",
    "editorLineNumber.foreground": "#636E7B",
    "editorCursor.foreground": "#3B82F6",
    "editor.selectionBackground": "#1E3A5F",
    "editorIndentGuide.background": "#252C37",
    "editorWidget.background": "#161B22",
    "editorWidget.border": "#252C37",
  },
};

export const LIGHT_THEME: EditorTheme = {
  base: "vs",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#FFFFFF",
    "editor.foreground": "#1F2328",
    "editor.lineHighlightBackground": "#F0F2F5",
    "editorLineNumber.foreground": "#8B949E",
    "editorCursor.foreground": "#3B82F6",
    "editor.selectionBackground": "#B6D0F5",
    "editorIndentGuide.background": "#D8DEE4",
    "editorWidget.background": "#F0F2F5",
    "editorWidget.border": "#D8DEE4",
  },
};
