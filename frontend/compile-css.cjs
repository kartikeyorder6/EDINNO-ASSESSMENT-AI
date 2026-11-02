const { compile } = require("@tailwindcss/node");
const { Scanner } = require("@tailwindcss/oxide");
const fs = require("fs");
const path = require("path");

async function buildCss() {
  const root = __dirname;
  const inputCss = `@import "tailwindcss";`;
  
  const compiler = await compile(inputCss, {
    base: root,
    onDependency: () => {},
  });

  const scanner = new Scanner({
    sources: [
      {
        base: root,
        pattern: "src/**/*.{tsx,ts,js,jsx}",
        negated: false,
      },
    ],
  });

  const candidates = scanner.scan();
  console.log(`[Tailwind Compiler] Scanned ${candidates.length} candidates from src/`);
  
  const compiled = compiler.build(candidates);
  
  const outputPath = path.join(root, "src/app/globals.css");
  fs.writeFileSync(outputPath, compiled, "utf8");
  console.log(`[Tailwind Compiler] Wrote ${compiled.length} bytes to ${outputPath}`);
}

buildCss().catch((err) => {
  console.error("[Tailwind Compiler Error]", err);
  process.exit(1);
});

