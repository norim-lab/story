import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const phpProxyTarget = env.VITE_SERVER_ORIGIN || 'https://story.zeitblytz.media';

  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    server: {
      proxy: {
        '/api/track.php': {
          target: phpProxyTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/api/audio.php': {
          target: phpProxyTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/api/proxy.php': {
          target: phpProxyTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/api/speedup.php': {
          target: phpProxyTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/anthropic': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/anthropic/, '/v1/messages')
        }
      },
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      }
    },
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
    }
  }
})
