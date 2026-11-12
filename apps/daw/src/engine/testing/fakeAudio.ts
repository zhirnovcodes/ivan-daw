// A minimal stand-in for Web Audio, for Vitest (Node has no AudioContext).
// It records connections and AudioParam automation calls so tests can assert on them.

export type ParamCall =
  | ['setValueAtTime', number, number]
  | ['linearRampToValueAtTime', number, number]
  | ['setTargetAtTime', number, number, number]
  | ['cancelScheduledValues', number]
  | ['cancelAndHoldAtTime', number];

export class FakeParam {
  calls: ParamCall[] = [];
  constructor(public value: number) {}
  setValueAtTime(v: number, t: number) {
    this.calls.push(['setValueAtTime', v, t]);
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(['linearRampToValueAtTime', v, t]);
    return this;
  }
  setTargetAtTime(v: number, t: number, c: number) {
    this.calls.push(['setTargetAtTime', v, t, c]);
    return this;
  }
  cancelScheduledValues(t: number) {
    this.calls.push(['cancelScheduledValues', t]);
    return this;
  }
  cancelAndHoldAtTime(t: number) {
    this.calls.push(['cancelAndHoldAtTime', t]);
    return this;
  }
  /** The target of the last ramp or glide, i.e. where the value is heading. */
  get target(): number | undefined {
    for (let i = this.calls.length - 1; i >= 0; i--) {
      const c = this.calls[i];
      if (c && c[0] !== 'cancelScheduledValues' && c[0] !== 'cancelAndHoldAtTime') return c[1];
    }
    return undefined;
  }
}

export class FakeNode {
  readonly outputs = new Set<FakeNode>();
  constructor(
    readonly kind: string,
    readonly ctx: FakeAudioContext,
  ) {
    ctx.created.push(this);
  }
  connect(dest: FakeNode, _output?: number, _input?: number) {
    this.outputs.add(dest);
    return dest;
  }
  disconnect(dest?: FakeNode) {
    if (dest) this.outputs.delete(dest);
    else this.outputs.clear();
  }
}

export class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
  constructor(ctx: FakeAudioContext) {
    super('gain', ctx);
  }
}

export class FakePanner extends FakeNode {
  readonly pan = new FakeParam(0);
  constructor(ctx: FakeAudioContext) {
    super('panner', ctx);
  }
}

export class FakeAnalyser extends FakeNode {
  fftSize = 2048;
  /** Every sample the analyser reports. */
  level = 0;
  constructor(ctx: FakeAudioContext) {
    super('analyser', ctx);
  }
  getFloatTimeDomainData(buf: Float32Array) {
    buf.fill(this.level);
  }
}

export class FakeAudioContext {
  currentTime = 0;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  sampleRate = 48000;
  readonly created: FakeNode[] = [];
  readonly destination: FakeNode = new FakeNode('destination', this);
  createGain() {
    return new FakeGain(this);
  }
  createStereoPanner() {
    return new FakePanner(this);
  }
  createAnalyser() {
    return new FakeAnalyser(this);
  }
  async resume() {
    this.state = 'running';
  }
  async close() {
    this.state = 'closed';
  }
  /** Casts this fake to the browser type the engine expects. */
  asContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}

/** True if audio flows from `from` to `to` through any chain of connections. */
export function reaches(from: FakeNode, to: FakeNode, seen = new Set<FakeNode>()): boolean {
  if (from === to) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  for (const next of from.outputs) if (reaches(next, to, seen)) return true;
  return false;
}
