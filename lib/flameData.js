const SCENTS = [
  "Mango",
  "Cinnamon",
  "Lavender",
  "Eucalyptus",
  "Lemon",
  "Grapefruit",
  "Orange",
  "Vanilla",
  "Sandalwood"
];

function pickScent(offset) {
  return SCENTS[offset % SCENTS.length];
}

export const auraMap = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [
    i + 1,
    {
      title: `Aura ${i + 1}`,
      body: "Steady and bright.",
      scent: [pickScent(i), pickScent(i + 1), pickScent(i + 2)]
    }
  ])
);

export const tarotMap = {
  wanderer: {
    title: "The Wanderer",
    body: "New beginnings, open paths, and the courage to step forward.",
    scent: ["Lavender", "Vanilla", "Sandalwood"]
  }
};

export const getZodiac = (birthMonth = 1) => ({
  sign: "Taurus",
  scent: [pickScent(birthMonth + 2), pickScent(birthMonth + 3), pickScent(birthMonth + 4)]
});

export const getYearAnimal = () => "Dragon";
export const getArrival = (m, d, y) => `${m}/${d}/${y}`;
export const availableScents = [...SCENTS];
