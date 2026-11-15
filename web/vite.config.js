import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'globe-preview-dev-home',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url === '/') {
            response.writeHead(302, { Location: '/globe-preview.html' })
            response.end()
            return
          }
          next()
        })
      },
    },
  ],
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        globePreview: fileURLToPath(new URL('./globe-preview.html', import.meta.url)),
      },
    },
  },
})
