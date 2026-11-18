# 04 · VST host (JUCE: VST3, AU, Standalone)

Builds the same core as a desktop plugin with JUCE, as Beatality's `hosts/plugin/` does. VST3 covers Ableton Live, FL Studio, Bitwig, Cubase, Reaper and Studio One. AU covers Logic Pro and GarageBand.

## JUCE version

Same pin as Beatality. CMake downloads it; a local `third_party/JUCE` checkout wins if present.

```cmake
else()  # not EMSCRIPTEN
    set(JUCE_BUILD_EXTRAS OFF CACHE BOOL "" FORCE)
    set(JUCE_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    set(<PFX>_JUCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/third_party/JUCE)
    if(EXISTS ${<PFX>_JUCE_DIR}/CMakeLists.txt)
        add_subdirectory(${<PFX>_JUCE_DIR} ${CMAKE_BINARY_DIR}/_juce EXCLUDE_FROM_ALL)
    else()
        include(FetchContent)
        FetchContent_Declare(juce
            GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
            GIT_TAG ea77444750de45e036e0279bb0291144bf8e3688 # 8.0.16-security, same as Beatality
            GIT_SHALLOW FALSE
            EXCLUDE_FROM_ALL)
        FetchContent_MakeAvailable(juce)
    endif()
    # juce_add_plugin(...) per type, below
endif()
```

Top of `CMakeLists.txt`, before `project()` (copy from Beatality):

```cmake
cmake_minimum_required(VERSION 3.25)
set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "macOS architectures")
set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "Minimum macOS version")
project(<Name> VERSION 0.0.1 LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
```

## Targets per plugin type

The type decides the flags. MIDI plugins need two targets because no single format setting works in every DAW (see the compatibility table below).

### Audio instrument (one target, same as Beatality)

```cmake
juce_add_plugin(<Name>
    COMPANY_NAME "zhirnovcodes"
    BUNDLE_ID com.ivancodes.<name>
    PLUGIN_MANUFACTURER_CODE <MFR>
    PLUGIN_CODE <CODE>
    FORMATS AU VST3 Standalone
    AU_MAIN_TYPE kAudioUnitType_MusicDevice
    HARDENED_RUNTIME_ENABLED TRUE
    PRODUCT_NAME "<Name>"
    VERSION 0.0.1
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE
    COPY_PLUGIN_AFTER_BUILD FALSE
    NEEDS_WEB_BROWSER TRUE
    NEEDS_WEBVIEW2 TRUE
    NEEDS_CURL FALSE
    VST3_CATEGORIES Instrument Synth)
```

### MIDI generator and MIDI control (two targets)

```cmake
# 1. VST3 + Standalone: an instrument with MIDI out and a silent stereo output.
#    Hosts that hide pure MIDI effects (Ableton, FL Studio) still load an instrument.
juce_add_plugin(<Name>
    COMPANY_NAME "zhirnovcodes"
    BUNDLE_ID com.ivancodes.<name>
    PLUGIN_MANUFACTURER_CODE <MFR>
    PLUGIN_CODE <CODE>
    FORMATS VST3 Standalone
    HARDENED_RUNTIME_ENABLED TRUE
    PRODUCT_NAME "<Name>"
    VERSION 0.0.1
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT TRUE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE
    COPY_PLUGIN_AFTER_BUILD FALSE
    NEEDS_WEB_BROWSER TRUE
    NEEDS_WEBVIEW2 TRUE
    NEEDS_CURL FALSE
    VST3_CATEGORIES Instrument Generator)

# 2. AU MIDI FX for Logic's MIDI FX slot.
juce_add_plugin(<Name>MidiFx
    COMPANY_NAME "zhirnovcodes"
    BUNDLE_ID com.ivancodes.<name>.midifx
    PLUGIN_MANUFACTURER_CODE <MFR>
    PLUGIN_CODE <CODEFX>
    FORMATS AU
    AU_MAIN_TYPE kAudioUnitType_MIDIProcessor
    HARDENED_RUNTIME_ENABLED TRUE
    PRODUCT_NAME "<Name> MIDI FX"
    VERSION 0.0.1
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT TRUE
    IS_MIDI_EFFECT TRUE
    NEEDS_WEB_BROWSER TRUE
    NEEDS_CURL FALSE)
```

Both targets compile the same `hosts/plugin/*.cpp`. The processor reads `JucePlugin_IsMidiEffect` to pick its bus layout:

```cpp
static BusesProperties buses() {
  #if JucePlugin_IsMidiEffect
    return BusesProperties();                                            // no audio buses
  #else
    return BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true);
  #endif
}
```

### Shared settings for every target

```cmake
foreach(t <Name> <Name>MidiFx)          # just <Name> for instruments
    if(NOT TARGET ${t})
        continue()
    endif()
    target_sources(${t} PRIVATE hosts/plugin/PluginProcessor.cpp hosts/plugin/PluginEditor.cpp)
    target_include_directories(${t} PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/hosts/common)
    target_compile_definitions(${t} PUBLIC
        JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0)
    target_link_libraries(${t}
        PRIVATE <pfx>_engine <Name>Skin juce::juce_audio_utils juce::juce_gui_extra
        PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)
endforeach()

juce_add_binary_data(<Name>Skin
    HEADER_NAME SkinData.h
    NAMESPACE SkinData
    SOURCES
        params.json
        hosts/plugin/ui/index.html
        hosts/plugin/ui/plugin.js
        apps/web/src/ui/skin.css)        # plus fonts and images the skin uses
```

## Codes and ids

| Field | Rule |
| --- | --- |
| `PLUGIN_MANUFACTURER_CODE` | 4 chars, at least one uppercase. Same for all your plugins. |
| `PLUGIN_CODE` | 4 chars, exactly one uppercase (AU rule). Unique per target. Never change after release: DAW projects store it. |
| `BUNDLE_ID` | Unique per target. |
| `VERSION` | Same as `manifest.version` in the web build. Bump both together. |

## Processor

Copy the shape of Beatality's `hosts/plugin/PluginProcessor.h`, simplified by `params.json`.

```cpp
class Processor : public juce::AudioProcessor {
public:
    Processor() : AudioProcessor(buses()), params(*this, nullptr, "params", layoutFromJson()) {
        for (auto& p : paramList) raw.push_back(params.getRawParameterValue(p.id));
    }
    void prepareToPlay(double rate, int) override { engine = std::make_unique<<pfx>::Engine>(rate, seed()); last.assign(raw.size(), NAN); }
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    // getStateInformation / setStateInformation: the same JSON as the web getState().data
    ...
private:
    juce::AudioProcessorValueTreeState params;
    std::vector<std::atomic<float>*> raw;   // plain values, index = params.json index
    std::vector<float> last;                // last value sent to the engine
    std::unique_ptr<<pfx>::Engine> engine;
    <pfx>::OutBuffer out;
};
```

`layoutFromJson()`: parse `SkinData::params_json` with `juce::JSON::parse`, then per entry:

| `kind` | JUCE parameter | Range |
| --- | --- | --- |
| `float` | `AudioParameterFloat` | `NormalisableRange` with `convertFrom0to1` / `convertTo0to1` lambdas implementing the same linear / log mapping as `toPlain` in [03](03-web-host.md) |
| `int` | `AudioParameterInt` | `min..max` |
| `choice` | `AudioParameterChoice` | `choices` |
| `boolean` | `AudioParameterBool` | – |
| `trigger` | `AudioParameterBool`, fires on false→true, reset to false on the message thread | – |

Use `juce::ParameterID { id, 1 }` with the `params.json` id, so DAW automation lanes keep their ids.

### processBlock

```cpp
void Processor::processBlock(juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi) {
    juce::ScopedNoDenormals noDenormals;
    const int frames = audio.getNumSamples();

    // 1. Parameters that changed since the last block.
    for (size_t i = 0; i < raw.size(); ++i) {
        const float v = raw[i]->load();
        if (v != last[i]) { engine->setParam((int)i, v); last[i] = v; }
    }

    // 2. Host transport at frame 0.
    if (auto* ph = getPlayHead())
        if (auto pos = ph->getPosition()) {
            <pfx>::Transport t;
            t.playing = pos->getIsPlaying();
            t.bpm = pos->getBpm().orFallback(120.0);
            t.beat = pos->getPpqPosition().orFallback(0.0);
            if (auto sig = pos->getTimeSignature()) { t.numerator = sig->numerator; t.denominator = sig->denominator; }
            if (changed(t)) engine->transport(t, 0);   // only on play/stop/tempo/jump, as in IvanDAW
        }

    // 3. MIDI in, at its sample position.
    for (const auto m : midi) {
        const auto msg = m.getMessage();
        if (msg.getRawDataSize() <= 3) {
            const auto* d = msg.getRawData();
            engine->midi(m.samplePosition, d[0], msg.getRawDataSize() > 1 ? d[1] : 0, msg.getRawDataSize() > 2 ? d[2] : 0);
        }
    }

    // 4. Render.
    out.clear();
    audio.clear();
    float* l = audio.getNumChannels() > 0 ? audio.getWritePointer(0) : nullptr;
    float* r = audio.getNumChannels() > 1 ? audio.getWritePointer(1) : nullptr;
    engine->process(frames, l, r, out);

    // 5. MIDI out (generators, controls). Instruments: midi.clear().
    midi.clear();
    for (int k = 0; k < out.size(); ++k) {
        const auto& e = out[k];
        if (e.kind == <pfx>::OutEvent::Midi)
            midi.addEvent(juce::MidiMessage(e.b0, e.b1, e.b2), e.frame);
        else
            midi.addEvent(controlToCc(e), e.frame);   // see types/midi-control.md
    }
}
```

`changed(t)`: true when `playing` flips, `bpm` changes, or `beat` jumps by more than one block's worth of beats (loop, locate). Otherwise the engine follows its own clock, the same as in IvanDAW where transport is not resent periodically.

`releaseResources()` and a transport stop: `engine->allOff(0, out)` and send what it returns, so no note hangs.

## Editor: the shared skin in a WebView

Same approach as Beatality's `PluginEditor`: `juce::WebBrowserComponent` with a resource provider serving files from `SkinData`, plus native functions as the bridge.

| Bridge call (skin → host) | JUCE implementation |
| --- | --- |
| `setParam(id, normalized, gesture?)` | `params.getParameter(id)->beginChangeGesture()` / `setValueNotifyingHost(n)` / `endChangeGesture()` |
| `requestState()` | sends all current normalized values |

| Bridge event (host → skin) | JUCE implementation |
| --- | --- |
| `param(id, normalized)` | a 30 Hz `juce::Timer` sends changed values with `emitEventIfBrowserIsVisible` |
| `state(json)` | after `setStateInformation` |

`hosts/plugin/ui/plugin.js` implements the bridge interface the skin expects on top of `window.__JUCE__`. `index.html` loads the same skin bundle as the web build.

Windows: `NEEDS_WEBVIEW2 TRUE` + `JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1` (as Beatality) so FL Studio / Ableton on Windows show the UI without a separate runtime install.

## DAW compatibility

What to expect, and the check to run for each. Record results in the repo README after each release (see [07](07-checklists.md)).

| DAW | Format | Instrument | MIDI generator / control |
| --- | --- | --- | --- |
| Logic Pro | AU | Software Instrument track | Load `<Name> MIDI FX` in the track's MIDI FX slot, above any instrument |
| GarageBand | AU | Software Instrument track | AU MIDI FX is not offered; not supported |
| Ableton Live | VST3 (AU on mac also works) | Instrument slot | Load `<Name>` on MIDI track A. On MIDI track B set *MIDI From* = track A, then the `<Name>` output. Put the target instrument on track B |
| FL Studio | VST3 | Channel rack | Load `<Name>`, set its MIDI output port in the wrapper settings, give the target plugin the same input port. Or route inside Patcher |
| Bitwig | VST3 | Instrument | Load as note FX in front of the instrument |
| Reaper | VST3 / AU | Instrument | Put in the FX chain before the instrument; MIDI passes down the chain |
| Cubase / Studio One | VST3 | Instrument track | Instrument track, route its MIDI out to another track |

Routing menus differ between DAW versions. Treat the routing column as the starting point; the release checklist confirms each one by ear.

## Local build

```
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build --target <Name>_VST3 <Name>_AU <Name>_Standalone <Name>MidiFx_AU
```

Artefacts: `build/<Name>_artefacts/Release/{VST3,AU,Standalone}/`. Install for testing:

| OS | VST3 | AU |
| --- | --- | --- |
| macOS | `~/Library/Audio/Plug-Ins/VST3/` | `~/Library/Audio/Plug-Ins/Components/` |
| Windows | `C:\Program Files\Common Files\VST3\` | – |
