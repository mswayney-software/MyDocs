import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { documentedDeckSchema, FORMAT_VERSION } from './schema'

/**
 * docs/deck.schema.json is generated from the same definitions the app validates with, so the
 * documentation cannot drift from the code. After changing schema.ts, regenerate it with:
 *   UPDATE_SCHEMA=1 npm test -w myslides
 */
/** Tests run from the app folder (apps/slides). */
const PATH = resolve(process.cwd(), 'docs/deck.schema.json')

function generate(): string {
  const schema = z.toJSONSchema(documentedDeckSchema, { io: 'input', unrepresentable: 'any' })
  return (
    JSON.stringify(
      {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: `myslides-deck-v${FORMAT_VERSION}`,
        title: 'MySlides deck.json',
        ...Object.fromEntries(Object.entries(schema).filter(([k]) => k !== '$schema')),
      },
      null,
      2,
    ) + '\n'
  )
}

test('docs/deck.schema.json matches the schema the app validates with', () => {
  const generated = generate()
  if (process.env.UPDATE_SCHEMA) writeFileSync(PATH, generated)
  expect(existsSync(PATH), 'run UPDATE_SCHEMA=1 npm test -w myslides').toBe(true)
  expect(readFileSync(PATH, 'utf8').replace(/\r\n/g, '\n')).toBe(generated)
})
