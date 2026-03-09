import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// https://vitejs.dev/config/
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), '');
    return {
        plugins: [react()],
        define: {
            'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        },
        server: {
            proxy: {
                '/anthropic': {
                    target: 'https://api.anthropic.com',
                    changeOrigin: true,
                    secure: true,
                    rewrite: function (path) { return path.replace(/^\/anthropic/, '/v1/messages'); }
                }
            }
        }
    };
});
