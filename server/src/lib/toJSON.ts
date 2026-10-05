// Shared toJSON transform: exposes `id` instead of `_id` and drops internal fields, so
// responses never carry Mongo internals or secrets by accident.

export function cleanJSON(hidden: string[] = []) {
  return {
    virtuals: false,
    transform(_doc: unknown, ret: Record<string, unknown>) {
      if (ret._id) ret.id = String(ret._id)
      delete ret._id
      delete ret.__v
      for (const field of hidden) delete ret[field]
      return ret
    },
  }
}
