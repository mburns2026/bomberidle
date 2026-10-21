import { defineConfig } from "vite";

// "base" = pasta onde o jogo e publicado. Padrao: /bomber-idle/ (site AI Studios Games).
// No GitHub Pages o workflow de deploy define VITE_BASE=/NOME-DO-REPO/ sozinho; para outro caminho:
//   VITE_BASE=/outro/ npm run build -w client
export default defineConfig({
  base: process.env.VITE_BASE ?? "/bomber-idle/",
  build: {
    // Phaser vai para um arquivo proprio: o navegador o mantem em cache entre versoes do jogo.
    rollupOptions: { output: { manualChunks: { phaser: ["phaser"] } } },
    chunkSizeWarningLimit: 1500, // o Phaser sozinho passa de 1 MB; o aviso padrao nao ajuda aqui
  },
});
