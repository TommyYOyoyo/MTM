export const NUMERIC_FACTORS = [
    "slope",
    "albedo", 
    "thermal", 
    "sun", 
    "roughness", 
];

export const FACTORS = [
    ...NUMERIC_FACTORS,
    "ice",
    "geology",
    "subsurface"
];

export const DEFAULT_WEIGHTS = {
  slope: 1,
  roughness: 1,
  albedo: 1,
  thermal: 1,
  sun: 1,
  ice: 1,
  geology: 1,
  subsurface: 0,
};
