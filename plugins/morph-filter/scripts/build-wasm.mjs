// Builds cpp/abi.cpp + ivan-daw-engine-core into prebuilt/morph-filter.wasm (committed).
// Needs emsdk on PATH (emcmake) and Ninja. Run it after changing cpp/ or the engine-core pin.

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const build = resolve(root, 'build-wasm');
const run = (cmd) => execSync(cmd, { stdio: 'inherit', cwd: root, shell: true });

run(`emcmake cmake -S "${root}" -B "${build}" -G Ninja -DCMAKE_BUILD_TYPE=Release`);
run(`cmake --build "${build}" --target morph_filter`);
