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
            // React core + router + query — always needed, cache together
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('react-router') ||
              id.includes('@tanstack/react-query')
            ) {
              return 'vendor-react'
            }
            // UI primitives (Radix + lucide)
            if (id.includes('@radix-ui') || id.includes('lucide-react')) {
              return 'vendor-ui'
            }
            // Everything else in node_modules
            return 'vendor-misc'
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
