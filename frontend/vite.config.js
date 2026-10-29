import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split large libraries into stable, long-cacheable chunks.
        // Chunk names are deliberately chosen so browser caches survive
        // app code updates that don't touch these libraries.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Charting library — largest single dependency
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-')) {
              return 'vendor-charts'
            }
            // Animation library
            if (id.includes('framer-motion')) {
              return 'vendor-motion'
            }
            // Date utilities
            if (id.includes('date-fns')) {
              return 'vendor-date'
            }
            // React core + router + query — always needed, cache together.
            // NOTE: scheduler, use-sync-external-store and other React internals
            // must live in the same chunk so they share the same React instance.
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('react-router') ||
              id.includes('@tanstack/react-query') ||
              id.includes('scheduler') ||
              id.includes('use-sync-external-store')
            ) {
              return 'vendor-react'
            }
            // UI primitives (Radix + lucide) — depend on React; keep co-located
            // so Rollup can guarantee vendor-react is resolved first.
            if (id.includes('@radix-ui') || id.includes('lucide-react')) {
              return 'vendor-ui'
            }
            // Do NOT add a catch-all 'vendor-misc' here — letting Rollup handle
            // remaining deps by default prevents cross-chunk React access errors
            // where a library reads React.memo before vendor-react has evaluated.
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
