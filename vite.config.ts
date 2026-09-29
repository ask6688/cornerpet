import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { handleGeneratePet, handleGenerationCapability } from './server/generate-pet.mjs';

const generationApi = () => ({
  name: 'cornerpet-generation-api',
  configureServer(server: { middlewares: { use: (handler: typeof handleGeneratePet) => void } }) { server.middlewares.use(handleGenerationCapability); server.middlewares.use(handleGeneratePet); },
  configurePreviewServer(server: { middlewares: { use: (handler: typeof handleGeneratePet) => void } }) { server.middlewares.use(handleGenerationCapability); server.middlewares.use(handleGeneratePet); },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (!process.env.ARK_API_KEY && env.ARK_API_KEY) process.env.ARK_API_KEY = env.ARK_API_KEY;
  if (!process.env.ARK_IMAGE_MODEL && env.ARK_IMAGE_MODEL) process.env.ARK_IMAGE_MODEL = env.ARK_IMAGE_MODEL;
  return {
    plugins: [react(), generationApi()],
    optimizeDeps: { include: ['onnxruntime-web/wasm'] },
    base: './',
    build: { rollupOptions: { input: { creator: 'index.html', pet: 'desktop/index.html' } } },
  };
});
