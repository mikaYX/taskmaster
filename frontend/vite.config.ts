import path from "path"
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['node_modules', 'e2e'],
    setupFiles: ['./src/test/setup-a11y.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        'node_modules/**',
        'e2e/**',
        'src/test/**',
        'src/main.tsx',
        '**/*.d.ts',
        '**/index.ts',
        'vite.config.ts',
      ],
      thresholds: {
        statements: 15,
        branches: 10,
        functions: 10,
        lines: 15,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (/(react|react-dom|react-router-dom)/.test(id)) return 'react-vendor';
          if (/(@radix-ui|lucide-react|class-variance-authority|clsx|tailwind-merge)/.test(id)) return 'ui-vendor';
          if (/@tanstack[\\/]react-query/.test(id)) return 'query-vendor';
          if (/(date-fns|date-fns-tz|rrule|cron-parser)/.test(id)) return 'date-vendor';
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
      },
      '/public': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
