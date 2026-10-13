import { defineConfig } from "vite";

export default defineConfig({
  server: { proxy: { "/api": "http://127.0.0.1:43187" } },
  build: { target: "es2022" }
});
