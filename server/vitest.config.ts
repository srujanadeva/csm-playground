// Server tests. Integration suites share one local MongoDB (each in its own database); running
// the files one at a time keeps their setup (drop database, hash passwords) from timing out
// under load, e.g. while the dev server is using the same MongoDB.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: false,
    hookTimeout: 60_000,
  },
})
