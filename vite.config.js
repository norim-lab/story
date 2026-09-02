import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// https://vitejs.dev/config/
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), '');
    var phpProxyTarget = env.VITE_SERVER_ORIGIN || 'https://story.zeitblytz.media';
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
                    rewrite: function (path) { return path.replace(/^\/api/, ''); },
                },
                '/api/audio.php': {
                    target: phpProxyTarget,
                    changeOrigin: true,
                    secure: true,
                    rewrite: function (path) { return path.replace(/^\/api/, ''); },
                },
                '/api/proxy.php': {
                    target: phpProxyTarget,
                    changeOrigin: true,
                    secure: true,
                    rewrite: function (path) { return path.replace(/^\/api/, ''); },
                },
                '/api/speedup.php': {
                    target: phpProxyTarget,
                    changeOrigin: true,
                    secure: true,
                    rewrite: function (path) { return path.replace(/^\/api/, ''); },
                },
                '/anthropic': {
                    target: 'https://api.anthropic.com',
                    changeOrigin: true,
                    secure: true,
                    rewrite: function (path) { return path.replace(/^\/anthropic/, '/v1/messages'); }
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
    };
});
