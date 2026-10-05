import { existsSync, readFileSync } from 'node:fs'
import { createServer as createHttpServer, type Server } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { resolve } from 'node:path'
import { createApp } from './app.ts'
import { connectDB, disconnectDB, redactUri } from './db.ts'
import { SERVER_DIR, loadEnvConfig } from './env.ts'
import { createLogger } from './lib/logger.ts'

const config = loadEnvConfig()
const logger = createLogger(config.LOG_LEVEL, !config.isProd)

// Fail closed on anything unexpected (OWASP A10): log it, then exit so the process manager
// restarts a clean process instead of serving from an unknown state.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled promise rejection')
  process.exit(1)
})
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception')
  process.exit(1)
})

async function main() {
  await connectDB(config.MONGO_URI)
  logger.info(`connected to MongoDB at ${redactUri(config.MONGO_URI)}`)

  const app = createApp(config, logger)
  const certFile = resolve(SERVER_DIR, config.TLS_CERT_FILE)
  const keyFile = resolve(SERVER_DIR, config.TLS_KEY_FILE)
  const tls = existsSync(certFile) && existsSync(keyFile)

  const server: Server = tls
    ? createHttpsServer({ cert: readFileSync(certFile), key: readFileSync(keyFile) }, app)
    : createHttpServer(app)
  if (!tls) logger.warn('TLS certs not found, serving plain HTTP. Run "npm run setup" to create them.')

  server.listen(config.PORT, () => {
    logger.info(`API listening on ${tls ? 'https' : 'http'}://localhost:${config.PORT}/api/v1`)
  })

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`)
    server.close(() => {
      void disconnectDB().finally(() => process.exit(0))
    })
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'server failed to start')
  process.exit(1)
})
