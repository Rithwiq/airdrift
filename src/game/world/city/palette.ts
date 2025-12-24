import * as THREE from "three";

export const col = (hex: string) => new THREE.Color(hex);

export const CityPalette = {
  base: col("#1b212b"),
  asphalt: col("#2a2f36"),
  asphaltEdge: col("#343a43"),
  sidewalk: col("#6b7078"),
  curb: col("#545a63"),

  laneWhite: col("#cfd5dd"),
  laneYellow: col("#d6b24a"),

  pole: col("#1c1f25"),
  lamp: col("#fff0c9"),
  lampEmit: col("#ffd9a1"),

  accent: col("#ff751f"),
  accentEmit: col("#ff751f"),

  buildingPalette: [
    col("#2f343c"),
    col("#3d434c"),
    col("#23262d"),
    col("#4a515c"),
    col("#2b3a49"),
    col("#3b3a37"),
  ],

  carPalette: [
    col("#1b1e24"),
    col("#2e343f"),
    col("#4b505a"),
    col("#3a3c38"),
    col("#1f2a3a"),
    col("#4a2e2e"),
  ],
};