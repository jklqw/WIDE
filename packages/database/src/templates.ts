export type StarterFile = {
  path: string;
  content: string;
};

export type StarterTemplate = {
  id: string;
  label: string;
  description: string;
  languageId: string;
  files: StarterFile[];
};

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "blank",
    label: "Blank",
    description: "Empty workspace",
    languageId: "plaintext",
    files: [{ path: "README.md", content: "# Workspace\n" }],
  },
  {
    id: "python",
    label: "Python",
    description: "Python 3 script",
    languageId: "python",
    files: [
      {
        path: "main.py",
        content:
          'def main() -> None:\n    name = input("Name: ").strip() or "world"\n    print(f"Hello, {name}!")\n\n\nif __name__ == "__main__":\n    main()\n',
      },
    ],
  },
  {
    id: "javascript",
    label: "JavaScript",
    description: "Node.js script",
    languageId: "javascript",
    files: [
      {
        path: "main.js",
        content:
          'const name = process.env.NAME ?? "world";\nconsole.log(`Hello, ${name}!`);\n',
      },
    ],
  },
  {
    id: "typescript",
    label: "TypeScript",
    description: "TypeScript script (tsx runtime)",
    languageId: "typescript",
    files: [
      {
        path: "main.ts",
        content:
          'const name: string = process.env["NAME"] ?? "world";\nconsole.log(`Hello, ${name}!`);\n',
      },
      {
        path: "tsconfig.json",
        content:
          '{\n  "compilerOptions": {\n    "target": "ES2022",\n    "module": "ESNext",\n    "moduleResolution": "Bundler",\n    "strict": true,\n    "skipLibCheck": true\n  }\n}\n',
      },
    ],
  },
  {
    id: "c",
    label: "C",
    description: "C17 program",
    languageId: "c",
    files: [
      {
        path: "main.c",
        content:
          '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, world!\\n");\n    return 0;\n}\n',
      },
    ],
  },
  {
    id: "cpp",
    label: "C++",
    description: "C++20 program",
    languageId: "cpp",
    files: [
      {
        path: "main.cpp",
        content:
          '#include <iostream>\n\nint main() {\n    std::cout << "Hello, world!" << std::endl;\n    return 0;\n}\n',
      },
    ],
  },
  {
    id: "java",
    label: "Java",
    description: "Java 21 program",
    languageId: "java",
    files: [
      {
        path: "Main.java",
        content:
          'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, world!");\n    }\n}\n',
      },
    ],
  },
  {
    id: "go",
    label: "Go",
    description: "Go program",
    languageId: "go",
    files: [
      {
        path: "main.go",
        content:
          'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, world!")\n}\n',
      },
    ],
  },
  {
    id: "html-web",
    label: "HTML",
    description: "Static HTML page",
    languageId: "html",
    files: [
      {
        path: "index.html",
        content:
          '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <title>Workspace</title>\n  </head>\n  <body>\n    <h1>Hello, world!</h1>\n  </body>\n</html>\n',
      },
    ],
  },
];

export function getTemplate(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((t) => t.id === id);
}
