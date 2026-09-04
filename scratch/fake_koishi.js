const chainable = () => new Proxy(function () { return chainable() }, {
  get(_t, prop) {
    if (typeof prop === 'symbol') return undefined
    return chainable()
  },
  apply: () => chainable(),
  construct: () => chainable(),
})
module.exports = { Context: class {} }
module.exports.Schema = new Proxy({}, {
  get(_, prop) {
    if (typeof prop === 'symbol') return undefined
    return chainable()
  },
})