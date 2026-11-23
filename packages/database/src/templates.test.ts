import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATES, getTemplate } from "./templates.js";

describe("workspace templates", () => {
  it("lists all starter templates", () => {
    const ids = STARTER_TEMPLATES.map((t) => t.id);
    for (const id of ["blank", "python", "javascript", "typescript", "c", "cpp", "java", "go", "html-web"]) {
      expect(ids).toContain(id);
    }
  });

  it("returns files for python template", () => {
    const t = getTemplate("python");
    expect(t?.files.length).toBeGreaterThan(0);
    expect(t?.files.some((f) => f.path.endsWith(".py"))).toBe(true);
  });

  it("returns undefined for unknown templates", () => {
    expect(getTemplate("nonexistent")).toBeUndefined();
  });
});
