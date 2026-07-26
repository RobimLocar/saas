export interface BRollPreset {
  key: string;
  label: string;
  prompt: string;
}

export const BROLL_PRESETS: BRollPreset[] = [
  {
    key: "hand_hold",
    label: "Hand Hold",
    prompt:
      "hands holding the product, natural lighting, UGC handheld style, subtle motion",
  },
  {
    key: "table_flat_lay",
    label: "Table Flat Lay",
    prompt:
      "product in a flat lay on a table, top-down, aesthetic props, soft light",
  },
  {
    key: "outdoor",
    label: "Outdoor/Natural",
    prompt:
      "product outdoors in a natural setting, daylight, gentle breeze",
  },
  {
    key: "slow_rotate",
    label: "Slow Rotate",
    prompt:
      "product slowly rotating on a surface, clean studio lighting, 360 feel",
  },
  {
    key: "unbox_reveal",
    label: "Unbox/Reveal",
    prompt:
      "hands unboxing and revealing the product, anticipation, close framing",
  },
  {
    key: "in_use_closeup",
    label: "In-Use Close-Up",
    prompt:
      "extreme close-up of the product being used/applied, tactile detail",
  },
  {
    key: "window_light",
    label: "Window Light",
    prompt:
      "product near a window with soft directional daylight, calm mood",
  },
  {
    key: "night_moody",
    label: "Night/Moody",
    prompt:
      "product in moody cinematic low-key lighting, dramatic shadows",
  },
];
