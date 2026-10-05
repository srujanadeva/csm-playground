import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const certDir = resolve(import.meta.dirname, '../certs')
const cert = resolve(certDir, 'cert.pem')
const key = resolve(certDir, 'key.pem')

// HTTPS is required: the session and CSRF cookies are Secure, so plain HTTP would break sign-in.
if (!existsSync(cert) || !existsSync(key)) {
  throw new Error('Dev TLS certs are missing (certs/cert.pem, certs/key.pem). Run "npm run setup" first.')
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    strictPort: true,
    host: 'localhost',
    https: { cert: readFileSync(cert), key: readFileSync(key) },
    proxy: {
      '/api': { target: 'https://localhost:4001', changeOrigin: false, secure: false },
    },
  },
  preview: { port: 3001, strictPort: true },
  build: { sourcemap: false },
})
