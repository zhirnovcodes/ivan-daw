// C ABI for the morph filter worklet. The DSP is ivan-daw-engine-core's Filter, set up exactly as
// AxolotlPad sets up its per-oscillator filter (core/engine/Engine.cpp): Morph, 12 dB/oct,
// morphLow 0.25, morphHigh 0.75. The knob mapping (D/W -> res and mix) lives in src/params.ts.
//
// The worklet writes a block into mf_left/mf_right, calls mf_process, and reads it back.
// No allocation after mf_create.

#include "ivandaw/fx/Filter.h"

#include <cstdlib>
#include <new>

#define MF_EXPORT extern "C" __attribute__((used, visibility("default")))

using namespace ivandaw::fx;

namespace {

constexpr int kMaxFrames = 128; // one Web Audio render quantum

struct Instance {
    explicit Instance(double rate) : dt(static_cast<float>(1.0 / rate)) {
        params.type = FilterType::Morph;
        params.slope = FilterSlope::Db12;
        params.morphLow = 0.25f;
        params.morphHigh = 0.75f;
    }

    Filter filter;
    FilterParams params;
    float dt;
    float left[kMaxFrames]{};
    float right[kMaxFrames]{};
};

} // namespace

MF_EXPORT Instance* mf_create(double rate) {
    if (!(rate > 0.0)) {
        return nullptr;
    }
    void* memory = std::malloc(sizeof(Instance));
    return memory ? new (memory) Instance(rate) : nullptr;
}

MF_EXPORT void mf_destroy(Instance* i) {
    if (i) {
        i->~Instance();
        std::free(i);
    }
}

// position: the FREQ knob, 0..1. res and mix: already mapped from the D/W knob.
MF_EXPORT void mf_set(Instance* i, float position, float res, float mix) {
    if (!i) {
        return;
    }
    i->params.filterPosition = position;
    i->params.res = res;
    i->params.mix = mix;
}

MF_EXPORT void mf_reset(Instance* i) {
    if (i) {
        i->filter.Reset();
    }
}

MF_EXPORT float* mf_left(Instance* i) { return i ? i->left : nullptr; }
MF_EXPORT float* mf_right(Instance* i) { return i ? i->right : nullptr; }

// Filters frames [offset, offset + frames) of the block in place.
MF_EXPORT void mf_process(Instance* i, int offset, int frames) {
    if (!i || offset < 0 || frames <= 0 || offset + frames > kMaxFrames) {
        return;
    }
    for (int f = offset; f < offset + frames; ++f) {
        const Sample s = i->filter.Apply(i->params, Sample{i->left[f], i->right[f]}, i->dt);
        i->left[f] = s.l;
        i->right[f] = s.r;
    }
}
