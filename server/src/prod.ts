// Production entry point: sets NODE_ENV portably (no shell syntax, so it works on Windows too).
process.env.NODE_ENV = 'production'
await import('./index.ts')
export {}
