// v1.2 plugin library texts: what the `?` button on a plugin window shows. Same format as sticky notes:
// `**bold**` and `<https://…>` links only. Design: docs/v1.2-redesign.md, "6. Plugin info".
// First drafts; Ivan edits them.

export const NO_INFO = 'No description yet.';

export const PLUGIN_INFO: Readonly<Record<string, string>> = {
  'builtin.master': `**Master** is where everything you hear ends up.

Plug audio into **AUD IN**. **Volume** and **Pan** set the level and balance of the whole mix.`,

  'com.ivandaw.axolotl-pad': `**Axolotl Pad** is an instrument: a soft pad you play with notes.

**MIDI IN**: notes to play.
**AUD OUT**: its sound; plug it into Master or an effect.
Its effects (filter, reverb, delay) can be moved from **ARM IN**.`,

  'com.ivandaw.banana-chords': `**Banana Chords** turns single notes into chords.

**MIDI IN**: the notes you play.
**MIDI OUT**: the chords; plug them into an instrument.
**Volume** sets how hard the chords are played (velocity), **Pan** sends MIDI pan.`,

  'com.ivandaw.base-sine-synth': `**Base sine synth**: the simplest instrument, one sine tone per note.

**MIDI IN**: notes to play.
**AUD OUT**: its sound.
Good for checking that notes arrive.`,

  'com.beatality.beatality': `**Beatality** slices a sample into steps and plays them as a beat.

**MIDI IN**: notes that start and stop it.
**AUD OUT**: the beat.
Load a pack, then shape it with Chaos, Effects and Sample settings.`,

  'com.ivandaw.choko-arpegio': `**Choko Arpegio** is an arpeggiator: it plays held notes one after another.

**MIDI IN**: the chord you hold.
**MIDI OUT**: the arpeggio; plug it into an instrument.
**Loop**, **Len.** and **Swing** shape the pattern; **Shuffle** and **Chaos** mix it up.`,

  'com.ivandaw.control-sliders': `**Control sliders**: two sliders, **a** and **b**, that move other plugins.

Draw a cable from **ARM OUT** to a plugin's **ARM IN**, then pick which slider (Out) and what it moves (In).`,

  'com.ivandaw.lfo': `**LFO** is a slow wave that moves things up and down by itself.

Draw a cable from **ARM OUT** to a plugin's **ARM IN**, pick what it moves (In), and set **Min** / **Max** for how far.`,

  'com.ivandaw.musichands': `**Music Hands** plays with your hands in front of the camera.

**MIDI OUT**: notes from your hand shapes.
**ARM OUT**: the left and right hand positions (x, y, z), to move other plugins.`,

  'com.ivandaw.note-gen': `**Note generator** plays a simple repeating note pattern while the song plays.

**MIDI OUT**: the notes; plug them into an instrument.`,

  'com.ivandaw.note-hold': `**Note hold** plays one long held note while the song plays.

**Stop** releases the note; the song plays on.
**Run next bar** waits for the next bar line, starts the note there and unticks itself.

**MIDI OUT**: the note; plug it into an instrument such as Beatality.`,
};

export const pluginInfo = (plugin: string): string => PLUGIN_INFO[plugin] ?? NO_INFO;
