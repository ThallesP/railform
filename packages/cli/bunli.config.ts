import { defineConfig } from "@bunli/core";

export default defineConfig({
  name: "railform",
  version: "0.0.1",
  build: {
    entry: "./src/index.ts",
    outdir: "./dist",
  },
  commands: {
    entry: "./src/index.ts",
    directory: "./src/commands",
  },
});
