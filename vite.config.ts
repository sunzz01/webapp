import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || '';
  const appBuild = env.VITE_APP_BUILD || (commitSha ? commitSha.slice(0, 7) : 'local');
  return {
    server: {
      port: 8080,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
      'import.meta.env.VITE_REMOVE_BG_API_KEY': JSON.stringify(env.VITE_REMOVE_BG_API_KEY),
      'import.meta.env.VITE_APP_BUILD': JSON.stringify(appBuild)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
