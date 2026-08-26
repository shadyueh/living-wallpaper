const Store = require('electron-store');
const { app } = require('electron');
const { DEFAULT_CONFIG } = require('../shared/constants');

const store = new Store({
  cwd: app.getPath('userData'),
  defaults: DEFAULT_CONFIG,
});

module.exports = {
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
