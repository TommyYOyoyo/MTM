import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

function hostedDetailTiles() {
  let outputDirectory
  return {
    name: 'hosted-detail-tiles',
    apply: 'build',
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir)
    },
    async writeBundle() {
      // The hosted size cap uses identical remote detail tiles, preserving full pixel quality.
      await Promise.all(['earth', 'mars'].map((planet) => rm(
        join(outputDirectory, 'textures', 'tiles', planet, '6'),
        { recursive: true, force: true },
      )))
    },
  }
}

export default defineConfig(({ mode }) => ({
  ...(mode === 'hosted' ? {
    define: {
      'import.meta.env.VITE_GLOBE_DETAIL_TILE_BASE_URL': JSON.stringify('https://raw.githubusercontent.com/TommyYOyoyo/MTM/b11175d28872f8b462a5ecc70206d93c22f1425e/web/public/textures/tiles'),
    },
  } : {}),
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === 'hosted' ? [hostedDetailTiles()] : []),
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
        app: fileURLToPath(new URL('./app.html', import.meta.url)),
        globePreview: fileURLToPath(new URL('./globe-preview.html', import.meta.url)),
      },
    },
  },
}))
