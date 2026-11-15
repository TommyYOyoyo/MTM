export const PRESETS = [
// Slope gets the largest weight
  {
    id: "landing-rover",
    label: "Landing/rover",
    weights: {
      slope: 30,
      albedo: 10,
      thermal: 20,
      sun: 20,
      ice: 5,
      geology: 15,
      subsurface: 0,
    },
  },

// Ice gets the largest weight
  {
    id: "ice-resources",
    label: "Ice/resources",
    weights: {
      slope: 5,
      albedo: 5,
      thermal: 15,
      sun: 10,
      ice: 50,
      geology: 15,
      subsurface: 0,
    },
  },

// Geology gets the largest weight
  {
    id: "geology",
    label: "Geology",
    weights: {
      slope: 15,
      albedo: 10,
      thermal: 10,
      sun: 5,
      ice: 5,
      geology: 55,
      subsurface: 0,
    },
  },
];