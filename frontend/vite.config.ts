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
    // Rendering the largest pages in jsdom takes ~1.5 s alone but over 5 s (the
    // default) when every worker runs at once on a busy machine. A real hang
    // still fails, after 15 s.
    testTimeout: 15_000,
    exclude: ['node_modules', 'e2e'],
    setupFiles: ['./src/test/setup-a11y.ts', './src/test/setup-i18n.ts', './src/test/setup-testing-library.ts'],
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
          // Anchored on the package folder: an unanchored /react/ also caught @radix-ui/react-*, lucide-react, react-query...
          if (/node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react-vendor';
          if (/node_modules[\\/](@radix-ui|lucide-react|class-variance-authority|clsx|tailwind-merge)[\\/]/.test(id)) return 'ui-vendor';
          if (/node_modules[\\/]@tanstack[\\/](react-query|query-core)[\\/]/.test(id)) return 'query-vendor';
          if (/node_modules[\\/](date-fns|date-fns-tz|rrule|cron-parser)[\\/]/.test(id)) return 'date-vendor';
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
