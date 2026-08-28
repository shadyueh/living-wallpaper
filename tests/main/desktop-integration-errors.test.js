jest.mock('koffi', () => {
  const { createKoffiMock } = require('../helpers/koffi-mock');
  return createKoffiMock({ progman: 0 });
});

let desktop;

beforeEach(() => {
  jest.resetModules();
  desktop = require('../../src/main/desktop/windows');
});

describe('windows desktop integration (error cases)', () => {
  test('getLayout throws when Progman not found', () => {
    expect(() => desktop.getLayout()).toThrow('Progman window not found');
  });

  test('resetLayerCache clears cached handles', () => {
    desktop.resetLayerCache();
  });
});