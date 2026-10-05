import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { ConfigError, loadConfig, type Config } from './config.ts'

export const SERVER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Loads server/.env, validates it, and exits with a readable message if anything is wrong. */
export function loadEnvConfig(): Config {
  dotenv.config({ path: resolve(SERVER_DIR, '.env'), quiet: true })
  try {
    return loadConfig(process.env)
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`${err.message}\n\nFix server/.env (run "npm run setup" to create missing values).`)
      process.exit(1)
    }
    throw err
  }
}
