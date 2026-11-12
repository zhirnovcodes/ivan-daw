import { describe, expect, it } from 'vitest';
import demoJson from '../../public/projects/demo.json';
import { emptyProject, MASTER_ID, MASTER_PLUGIN, parseProject } from './project';

const demo = (): unknown => structuredClone(demoJson);
describe('parseProject', () => {
  it('reads the demo project: note-gen → sine → Master', () => {
    const p = parseProject(demo());
    expect(p.transport).toEqual({ bpm: 120, numerator: 4, denominator: 4 });
    expect(p.nodes.map((n) => [n.id, n.plugin])).toEqual([
      ['n1', 'com.ivandaw.note-gen'],
      ['n2', 'com.ivandaw.base-sine-synth'],
      [MASTER_ID, MASTER_PLUGIN],
    ]);
    expect(p.cables).toEqual([
      { id: 'c1', from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' } },
      { id: 'c2', from: { node: 'n2', port: 'out' }, to: { node: 'master', port: 'in' } },
    ]);
  });

  it('fills defaults and clamps values into range', () => {
    const p = parseProject({
      format: 'ivandaw.project',
      version: 1,
      transport: { bpm: 999 },
      nodes: [
        { id: 'n1', plugin: 'x', x: 0, y: 0 },
        { id: 'n2', plugin: 'x', x: 0, y: 0, gain: 9, pan: -3, params: { level: 2 } },
      ],
      cables: [],
    });
    expect(p.transport).toEqual({ bpm: 240, numerator: 4, denominator: 4 });
    expect(p.nodes[0]).toEqual({
      id: 'n1',
      plugin: 'x',
      x: 0,
      y: 0,
      gain: 1,
      pan: 0,
      bypass: false,
      params: {},
    });
    expect(p.nodes[1]).toMatchObject({ gain: 1.5, pan: -1, params: { level: 1 } });
  });

  it('adds Master when it is missing', () => {
    const p = parseProject({ ...emptyProject(), nodes: [] });
    expect(p.nodes.map((n) => n.id)).toEqual([MASTER_ID]);
  });

  it.each([
    ['not an object', null],
    ['wrong format', { ...emptyProject(), format: 'webdaw.project' }],
    ['wrong version', { ...emptyProject(), version: 2 }],
    ['missing bpm', { ...emptyProject(), transport: {} }],
    ['nodes not an array', { ...emptyProject(), nodes: {} }],
    ['a node without x', { ...emptyProject(), nodes: [{ id: 'n1', plugin: 'x', y: 0 }] }],
    [
      'duplicate node ids',
      {
        ...emptyProject(),
        nodes: [
          { id: 'n1', plugin: 'x', x: 0, y: 0 },
          { id: 'n1', plugin: 'x', x: 0, y: 0 },
        ],
      },
    ],
    [
      'a second Master',
      { ...emptyProject(), nodes: [{ id: 'n1', plugin: MASTER_PLUGIN, x: 0, y: 0 }] },
    ],
    [
      'a cable to an unknown node',
      {
        ...emptyProject(),
        cables: [
          { id: 'c1', from: { node: 'n9', port: 'out' }, to: { node: 'master', port: 'in' } },
        ],
      },
    ],
    [
      'duplicate cable ids',
      {
        ...emptyProject(),
        nodes: [{ id: 'n1', plugin: 'x', x: 0, y: 0 }],
        cables: [
          { id: 'c1', from: { node: 'n1', port: 'out' }, to: { node: 'master', port: 'in' } },
          { id: 'c1', from: { node: 'n1', port: 'out' }, to: { node: 'master', port: 'in' } },
        ],
      },
    ],
  ])('throws on %s', (_name, raw) => {
    expect(() => parseProject(raw)).toThrow();
  });
});
