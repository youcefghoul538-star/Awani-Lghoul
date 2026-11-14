import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Installable admin app (PWA). The manifest and the service worker are emitted INSIDE the secret admin
 * path, so their URL is as private as the dashboard itself and their scope is limited to it.
 * The service worker does not cache anything: dashboard data must always be live.
 */
function adminPwa(adminPath: string): Plugin {
  const base = `/${adminPath}/`
  return {
    name: 'admin-pwa',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: `${adminPath}/manifest.webmanifest`,
        source: JSON.stringify(
          {
            name: "AWANI L'GHOUL · Administration",
            short_name: 'AWANI Admin',
            start_url: base,
            scope: base,
            id: base,
            display: 'standalone',
            background_color: '#ffffff',
            theme_color: '#0e5a46',
            lang: 'fr',
            icons: [
              { src: '/admin-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
              { src: '/admin-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
            ],
          },
          null,
          2,
        ),
      })
      this.emitFile({
        type: 'asset',
        fileName: `${adminPath}/sw.js`,
        source:
          "self.addEventListener('install',()=>self.skipWaiting());\n" +
          "self.addEventListener('activate',(e)=>e.waitUntil(self.clients.claim()));\n" +
          "self.addEventListener('fetch',(e)=>{e.respondWith(fetch(e.request))});\n",
      })
    },
  }
}

// Same rule as src/admin/base.ts
export default defineConfig(({ mode }) => {
  const raw = loadEnv(mode, process.cwd(), 'VITE_').VITE_ADMIN_PATH?.trim().replace(/^\/+|\/+$/g, '')
  const adminPath = raw && /^[a-z0-9][a-z0-9_-]{9,}$/i.test(raw) ? raw : 'gestion-hv7rw1p9ofzlogph'
  return { plugins: [react(), adminPwa(adminPath)] }
})
