export default {
  "help.speed":
    "Scroll speed\nControls how fast notes scroll.\n\n'C' values: constant scroll speed (pixels per second), independent of BPM changes.\n\n'x' values: multiply the song's BPM.\n\nHigher values spread notes further apart, making fast patterns easier to read.",
  "help.reverse":
    "Reverse scroll\nNotes scroll from top to bottom instead of bottom to top. Some players prefer this for visibility or comfort.",
  "help.mirror":
    "Mirror\nFlips the note columns horizontally (left becomes right). Useful for practicing patterns from a different perspective.",
  "help.sudden":
    "Sudden (upper hidden)\nNotes are invisible in the upper half of the screen. They appear as they enter the lower half, giving you less time to react. AutoPlay still works with this enabled.",
  "help.hidden":
    "Hidden (lower hidden)\nNotes are invisible in the lower half of the screen. They are visible in the upper half but disappear as they approach. AutoPlay still works with this enabled.",
  "help.rotate":
    "Rotate\nNotes spin as they scroll. The further from the receptor, the more they are rotated. AutoPlay still works with this enabled.",
  "help.noteskin":
    "Note skin\nOnly available in Pump Single and Pump Double. Picks a built-in palette (Default, Flat, Neon, Retro, …) for notes, receptors, and holds. In Pump Routine mode, use Note color (per chart layer) instead; this row is hidden there. Note shape is separate and does not affect timing.",
  "help.colorScheme":
    "Color scheme\nOnly shown in pump-single and pump-double. Chooses the built-in color scheme for notes, receptors, and hold bodies. Pump Routine hides this and uses “Note color” for the two '&' layers in the chart. Note shape is a separate option.",
  "help.noteScale":
    "Note scale\nAdjusts the visual size of notes and receptors. Smaller sizes leave more space between columns but may be harder to read. Default is 1x.",
  "help.batteryLives":
    "Battery lives\nSets the number of lives in Battery mode. Each combo break costs one life. When all lives are lost, the stage fails.",
  "help.playbackRate":
    "Playback rate\nChanges the song playback speed. Lower values slow down the song for practice; higher values speed it up for a challenge. 1x is normal speed.",
  "help.masterVolume":
    "Master volume\nControls the overall volume of all audio output. Affects both music and sound effects proportionally.",
  "help.musicVolume":
    "Music volume\nControls the volume of background music during gameplay. Adjusts relative to the master volume.",
  "help.effectVolume":
    "Effect volume\nShared baseline for Click SFX, Metronome SFX, and Rhythm SFX.\n\nClick SFX: button press, back, and menu toggle feedback.\nMetronome SFX: beat-line ticks that fire when a beat reaches the receptor line.\nRhythm SFX: per-lane key approach ticks when each lane reaches the receptor line.\n\nBoth metronome and rhythm groups have their own level slider and style preset (warm / bright / crisp). Final loudness is also affected by Master volume.",
  "help.metronomeSfx":
    "Metronome SFX\nControls beat-line tick cues when beats reach the receptor line. Turning this off mutes beat-line ticks but keeps lane approach rhythm cues available.",
  "help.metronomeSfxVolume":
    "Metronome SFX level\nScales beat-line metronome ticks relative to Effect volume only.",
  "help.rhythmSfx":
    "Rhythm SFX\nControls per-lane approach cues when each lane reaches the receptor line (in gameplay and chart editor). This does not control beat-line metronome ticks.",
  "help.rhythmSfxVolume":
    "Rhythm SFX level\nScales per-lane rhythm cues relative to Effect volume only.",
  "help.audioOffset":
    "Audio offset\nCompensates for audio hardware latency. Positive values delay the audio; negative values advance it. Adjust if notes feel consistently early or late. Measured in milliseconds.",
  "help.windowDisplay":
    "Window & display\nChoose a custom resizable window, common fixed aspect resolutions, borderless, or fullscreen. Fixed presets lock the inner size; borderless stays windowed while removing the title bar.",
  "help.vsync":
    "VSync\nVertical Synchronization prevents screen tearing by syncing frame rendering with the display refresh rate. May add slight input latency.",
  "help.targetFps":
    "Target FPS\nCaps how often the note field canvas redraws. Higher values help until the display and WebView limit you (requestAnimationFrame usually follows refresh). Unlimited removes the cap and redraws every animation callback. The VSync checkbox is saved to config but does not yet drive the native window.",
  "help.uiScale":
    "UI scale\nAdjusts the overall size of the user interface including text, buttons, and controls. Useful for high-DPI displays or personal preference. Default is 100%.",
  "help.doublePanelGap":
    "Dual panel spacing\nHorizontal gap in pixels between the left and right note fields whenever the game shows two panels side by side — including Pump solo on a 10-lane field (left/right foot), Pump Double, Routine (10-key split), and Co-op with two mirrored 5-column fields. Narrow single-panel charts (e.g. 5 lanes) are unchanged. Saved in your config file. Default 56 px; range 16–160 px.",
  "help.cursorEnabled":
    "Custom cursor\nEnable the in-game custom cursor. Disabling restores the system cursor and hides click ripples.",
  "help.cursorStylePreset":
    "Cursor style\nChoose between two visual cursor styles.\n\nSoft: rounded edge and lighter contrast, more subtle in motion.\nSharp: stronger outline and cut-line detail, clearer on dark backgrounds.",
  "help.cursorScale":
    "Cursor size\nAdjust the size of the custom cursor. 100% matches the default size.",
  "help.cursorOpacity":
    "Cursor opacity\nControls overall transparency of the custom cursor. Lower values make it less prominent.",
  "help.cursorGlow":
    "Cursor glow\nControls glow intensity around the cursor. 0 disables glow.",
  "help.cursorTrailsEnabled":
    "Hide system cursor\nHides the OS cursor while the custom cursor is enabled.",
  "help.cursorRippleEnabled":
    "Click ripple\nToggle the water ripple click effect.",
  "help.cursorRippleDurationMs":
    "Ripple duration\nHow long the ripple animation lasts in milliseconds.",
  "help.cursorRippleMinScale":
    "Ripple start scale\nInitial size of the ripple. 1.00x matches the cursor size.",
  "help.cursorRippleMaxScale":
    "Ripple end scale\nFinal size of the ripple. Higher values make larger ripples.",
  "help.cursorRippleOpacity":
    "Ripple opacity\nOverall transparency of the ripple effect.",
  "help.cursorRippleLineWidth":
    "Ripple line width\nStroke thickness of the ripple ring.",
  "help.cursorRippleGlow":
    "Ripple glow\nControls the glow intensity around the ripple.",
  "help.theme":
    "Theme\nChoose a curated dark UI palette. Includes widely used community themes (Nord, Dracula, Catppuccin, Tokyo Night, …), nature / terminal palettes (Everforest, Kanagawa, Ayu), and an OLED-oriented true black option. Changes apply immediately.",
  "help.judgmentStyle":
    "Judgment style\nChanges the naming convention for timing judgments. DDR style uses Marvelous/Perfect/Great/Good/Boo. ITG style uses Fantastic/Excellent/Great/Decent/Way Off. Timing windows remain the same.",
  "help.showOffset":
    "Timing offset display\nDisplays the timing offset (in milliseconds) for each note hit during gameplay. Positive values mean late, negative means early. Helpful for calibrating audio offset.",
  "help.language":
    "Language\nChanges the display language for all menus and UI elements. Currently supports English and Simplified Chinese.",
  "help.lifeType":
    "Life bar type\nDetermines how your life bar behaves. Normal Bar: fills and drains gradually. Battery: you have a fixed number of lives, each combo break costs one. Survival: life drains much faster from misses, harder to recover.",
  "help.autoPlay":
    "Auto Play\nWhen enabled, the game automatically hits all judgeable notes at the best timing (W1 / Marvelous or Fantastic). Useful for chart preview and demo play.",
  "help.showParticles":
    "Particle effects\nShows particle animations in hit effects, feedback, and some UI flourishes. Turn it off to reduce visual clutter and save a bit of performance.",
  "help.routineLayerP1":
    "Routine layer 1 color\nOnly in Pump Routine mode. Chart note data is often split by '&' into two layers on the same timeline. This sets the display color for notes from the first block (before the first '&'). Not tied to left/right panel. With the default note shape, this tint applies; custom NoteSkins usually follow the skin's own colors.",
  "help.routineLayerP2":
    "Routine layer 2 color\nOnly in Routine mode. Display color for the second block (after '&'), including parallel SSC overlays and stacked legacy P2 sections. Follows chart layers, not screen side. Default shape: uses these colors; custom skins often use skin colors.",
  "help.topicFallback": "Help",
  "help.none": "No help text is available for this item.",
} as const;
