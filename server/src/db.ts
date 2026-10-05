import mongoose from 'mongoose'

// Defence in depth for NoSQL injection (OWASP A05): strictQuery drops filter keys the schema
// doesn't know, and sanitizeFilter wraps any $-operator smuggled into a filter value in $eq.
mongoose.set('strictQuery', true)
mongoose.set('sanitizeFilter', true)

export async function connectDB(uri: string): Promise<void> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000, autoIndex: true })
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect()
}

export const dbReady = () => mongoose.connection.readyState === 1

/** Mongo URI with any password replaced, safe to log. */
export const redactUri = (uri: string) => uri.replace(/\/\/([^:@/]+):[^@/]+@/, '//$1:****@')
