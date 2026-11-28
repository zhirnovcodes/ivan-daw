// The recorder's AudioWorklet (2026-11-28), loaded from a Blob URL so it needs no file of its own.
// It copies Master's output into 4096-frame stereo chunks (about 11 a second at 48 kHz) and posts them
// to the main thread. It stops by itself after `maxFrames`, posting `done` with reason 'limit'.
// Messages in: 'stop' (end now, reason 'stop'), 'dispose' (let the browser drop the node).

export const RECORDER_PROCESSOR = 'ivandaw-recorder';

export const RECORDER_WORKLET_SRC = `
const CHUNK = 4096;
class IvanDawRecorder extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.max = options.processorOptions.maxFrames;
    this.frames = 0;
    this.fill = 0;
    this.l = new Float32Array(CHUNK);
    this.r = new Float32Array(CHUNK);
    this.done = false;
    this.dead = false;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.end('stop');
      else if (e.data === 'dispose') this.dead = true;
    };
  }
  flush() {
    if (this.fill === 0) return;
    const l = this.l.slice(0, this.fill);
    const r = this.r.slice(0, this.fill);
    this.port.postMessage({ type: 'chunk', l, r }, [l.buffer, r.buffer]);
    this.fill = 0;
  }
  end(reason) {
    if (this.done) return;
    this.done = true;
    this.flush();
    this.port.postMessage({ type: 'done', reason, frames: this.frames });
  }
  process(inputs) {
    if (this.dead) return false;
    if (this.done) return true;
    const input = inputs[0] || [];
    const L = input[0];
    const R = input[1] || input[0];
    const n = L ? L.length : 128;
    for (let i = 0; i < n; i++) {
      if (this.frames >= this.max) break;
      this.l[this.fill] = L ? L[i] : 0;
      this.r[this.fill] = R ? R[i] : 0;
      this.fill++;
      this.frames++;
      if (this.fill === CHUNK) this.flush();
    }
    if (this.frames >= this.max) this.end('limit');
    return true;
  }
}
registerProcessor('${RECORDER_PROCESSOR}', IvanDawRecorder);
`;
