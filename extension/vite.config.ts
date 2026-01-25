import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { copyFileSync } from "fs";

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    {
      name: 'copy-manifest',
      closeBundle() {
        copyFileSync('public/manifest.json', 'dist/manifest.json');
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html')
      },
      output: {
        entryFileNames: '[name].js',
      }
    },
    outDir: 'dist',
  },
});