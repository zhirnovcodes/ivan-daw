// Test-only plugin whose create() rejects (E2). Served by e2e/fixtures.ts, never in plugins/.

export default {
  manifest: {
    id: 'test.e2e.broken-create',
    name: 'E2E broken create',
    vendor: 'IvanDAW tests',
    version: '0.0.0',
    apiVersion: 2,
    kind: 'instrument',
    ports: [
      { id: 'in', label: 'in', kind: 'events', direction: 'in', accepts: ['midi'] },
      { id: 'out', label: 'out', kind: 'audio', direction: 'out', channels: 2, main: true },
    ],
    ui: null,
    features: [],
  },
  async create() {
    throw new Error('fixture: create() always rejects');
  },
};
