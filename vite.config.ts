import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    open: true,
    port: 3000,
    headers: {
      "Cache-Control": "public, max-age=86400, must-revalidate"
    }
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      types: path.resolve(__dirname, "src/types"),
      components: path.resolve(__dirname, "./src/components"),
      constants: path.resolve(__dirname, "src/constants"),
      hooks: path.resolve(__dirname, "src/hooks"),
      layouts: path.resolve(__dirname, "src/layouts"),
      assets: path.resolve(__dirname, "src/assets"),
      modules: path.resolve(__dirname, "src/modules"),
      apis: path.resolve(__dirname, "src/apis"),
      utils: path.resolve(__dirname, "src/utils"),
      store: path.resolve(__dirname, "src/store")
    }
  }
});
