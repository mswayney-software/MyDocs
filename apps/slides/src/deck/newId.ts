/** Ids carry no meaning; they only need to be unique within a deck. */
export const newId = (prefix: string) => `${prefix}${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
