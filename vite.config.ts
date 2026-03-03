import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@client': '/src/client',
      '@shared': '/src/shared',
    },
  },
})
