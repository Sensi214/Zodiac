export const auraMap = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, { title: `Aura ${i + 1}`, body: "Steady and bright.", scent: ["Jasmine", "Cedar", "Amber"] }]));
export const tarotMap = { fool: { title: "The Fool", body: "Fresh starts.", scent: ["Linen", "Iris", "Sandalwood"] } };
export const getZodiac = () => ({ sign: "Taurus", scent: ["Rose", "Vanilla", "Oak"] });
export const getYearAnimal = () => "Dragon";
export const getArrival = (m, d, y) => `${m}/${d}/${y}`;
