import assert from 'node:assert/strict'
import test from 'node:test'

/** Loaded client module definition, captured from the module loader shim. */
let definition

globalThis.window = {
  __ModuleLoader__: {
    load: (value) => {
      definition = value
    },
  },
}

await import('../client.js')

/** Minimal React surface the client module touches at import/apply time. */
const reactStub = {
  createElement: () => null,
  useEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  useState: (initial) => [initial, () => {}],
}

/**
 * Build the browser plugin context surface `apply` touches.
 * @returns `{ ctx, registrations }`.
 */
function fakeContext() {
  const registrations = []
  const ctx = {
    effect: (callback) => {
      callback()
    },
    locale: {
      bind: () => (key) => key,
      register: () => {},
    },
    slots: {
      inject: (slot, callback) => {
        callback()
      },
      register: (spec, component) => {
        registrations.push({ spec, component })
        return () => {}
      },
    },
  }
  return { ctx, registrations }
}

test('client module declares the loader identity', () => {
  assert.ok(definition, 'window.__ModuleLoader__.load was not called')
  assert.equal(definition.id, 'dsh-win-approval-notify')
  assert.equal(typeof definition.factory, 'function')
})

test('client apply exposes inject and registers the row config page', () => {
  const exported = definition.factory((id) => {
    if (id === 'react') return reactStub
    throw new Error(`unexpected require: ${id}`)
  })
  assert.equal(typeof exported.apply, 'function')
  assert.deepEqual(exported.inject, ['slots', 'locale'])

  const fake = fakeContext()
  exported.apply(fake.ctx)
  assert.equal(fake.registrations.length, 1)
  const registration = fake.registrations[0]
  assert.equal(registration.spec.name, 'plugins.row.config')
  assert.equal(registration.spec.key, 'dsh-win-approval-notify#approval-notify')
  assert.equal(registration.spec.locale, 'approvalNotify')
  assert.equal(typeof registration.component, 'function')
})

