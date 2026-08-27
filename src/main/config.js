const { DEFAULT_CONFIG } = require('../shared/constants');

let store = null;

async function init(StoreOverride) {
  if (StoreOverride) {
    store = new StoreOverride({ defaults: DEFAULT_CONFIG });
  } else {
    const mod = await import('electron-store');
    store = new mod.default({ defaults: DEFAULT_CONFIG });
  }
}

module.exports = {
  init,
  get(key) { return store.get(key); },
  set(key, value) { store.set(key, value); },
  getAll() { return { ...store.store }; },
  reset() {
    for (const key of Object.keys(store.store)) {
      store.delete(key);
    }
    for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
      store.set(key, value);
    }
  },
};
