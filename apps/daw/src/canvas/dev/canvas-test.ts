// Dev-only page for P5: /src/canvas/dev/canvas-test.html on the dev server.
// Fake manifests and the stub router (allows everything except self cables); no audio at all.

import { manifestsFrom } from '../../model/catalog';
import { fetchProject } from '../../model/project';
import { loadProject, setNodeStatus } from '../../store/actions';
import { provide } from '../../store/store';
import { mountCanvas } from '../index';

const manifests = manifestsFrom({
  plugins: [
    {
      id: 'com.ivandaw.note-gen',
      name: 'Note generator',
      kind: 'midi',
      url: '',
      ports: [{ id: 'out', label: 'out', kind: 'events', direction: 'out', accepts: ['midi'] }],
    },
    {
      id: 'com.ivandaw.base-sine-synth',
      name: 'Base sine synth',
      kind: 'instrument',
      url: '',
      ports: [
        { id: 'in', label: 'in', kind: 'events', direction: 'in', accepts: ['midi'] },
        { id: 'out', label: 'out', kind: 'audio', direction: 'out', channels: 2, main: true },
      ],
    },
  ],
});

provide({ manifests });
loadProject(await fetchProject('/projects/demo.json'));
setNodeStatus('n1', 'error', 'Demo error: this plugin failed to load');
setNodeStatus('n2', 'loading');

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
mountCanvas(root);
