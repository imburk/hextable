// Light that a creature can carry, from the SRD's Adventuring Gear (SRD 5.2.1). Each gives a
// radius of Bright Light and then that many feet more of Dim Light, in feet. Data only.
// The Bullseye Lantern lights a cone, which a carried light cannot say yet; the DM handles it.
// Equipment states (rules expansion R10) will take these from a creature's gear; until then the
// DM hands one out with the `setLight` action.
export const LIGHTS = {
  candle: { name: 'Candle', bright: 5, dim: 5 },
  torch: { name: 'Torch', bright: 20, dim: 20 },
  lamp: { name: 'Lamp', bright: 15, dim: 30 },
  'hooded-lantern': { name: 'Hooded Lantern', bright: 30, dim: 30 },
  'hooded-lantern-lowered': { name: 'Hooded Lantern (hood lowered)', bright: 0, dim: 5 },
};
// How light a place is with nothing lit in it, for a level or a region.
export const AMBIENT = ['bright', 'dim', 'dark'];
