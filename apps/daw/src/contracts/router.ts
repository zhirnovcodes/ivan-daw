// Contract C5 (router part). Owner: P8, apps/daw/src/router.
// Tech design: "Ports and cables" and "Router".

import type { ManifestMap } from '../model/catalog';
import type { Cable, PortRef, Project } from '../model/project';

/** Why `validate` refused a cable. Checked in this order; the first failure is returned. */
export type RefuseReason = 'self' | 'direction' | 'kind' | 'duplicate' | 'cycle';

export type ValidateResult = { ok: true } | { ok: false; reason: RefuseReason };

/** Short, user-facing text for each refusal, shown by the canvas for 2 s. */
export const REFUSE_TEXT: Record<RefuseReason, string> = {
  self: 'a node cannot connect to itself',
  direction: 'connect an output to an input',
  kind: 'these ports carry different things',
  duplicate: 'this cable already exists',
  cycle: 'would create a loop',
};

/** One planned connection. `id` is the cable id it comes from. */
export type WiringEdge = Pick<Cable, 'id' | 'from' | 'to'>;

/** The connections to make real: exactly the project's cables whose two nodes are ready. */
export interface Wiring {
  audio: WiringEdge[];
  events: WiringEdge[];
  /** v1.1: modulation out → a host-made `ctl:*` input. */
  control: WiringEdge[];
}

export interface Router {
  /**
   * Pure. Checks one proposed cable against the cable rules:
   * 1 self, 2 direction, 3 kind (events: out port's `accepts` and in port's `accepts` share a type),
   * 4 duplicate, 5 cycle in the combined audio + events + control graph.
   * v1.1: `ctl:gain`, `ctl:pan`, `ctl:param:<id>` are host-made modulation inputs.
   * A cable onto a taken input is valid: the store replaces the old cable (Master `in` sums instead).
   * `manifests` is keyed by plugin id and includes `builtin.master`.
   * A node or port missing from the project or the manifests is refused with 'kind'.
   */
  validate(p: Project, manifests: ManifestMap, from: PortRef, to: PortRef): ValidateResult;
  /** Pure. Keeps only cables whose two nodes are `ready` in `status`, split by port kind. */
  plan(p: Project, manifests: ManifestMap, status: Readonly<Record<string, string>>): Wiring;
  /** Diffs `prev` → `next` onto the engine with 10 ms cable-gain fades. The only step that touches Web Audio. */
  apply(prev: Wiring, next: Wiring): void;
}
