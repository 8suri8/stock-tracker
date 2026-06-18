// src/constants.js

// ── Default items (used only if Firebase has no items yet) ──────────────
export const SEED_ITEMS = {
  alcohol: [
    { id: "carib", name: "Carib", price: 13.0 },
    { id: "pilsner", name: "Pilsner", price: 13.0 },
    { id: "stag", name: "Stag", price: 13.0 },
    { id: "nip_puncheon", name: "Nip Puncheon", price: 65.0 },
  ],
  cigarettes: [
    { id: "atlanta_20", name: "Atlanta pack (20s)", price: 20.0 },
    { id: "broadway_20", name: "Broadway pack (20s)", price: 38.0 },
    { id: "broadway_10", name: "Broadway ½ pack (10s)", price: 20.0 },
    { id: "du_maurier_20", name: "Du Maurier pack (20s)", price: 25.0 },
    { id: "du_maurier_10", name: "Du Maurier ½ pack (10s)", price: 15.0 },
    { id: "du_maurier_short_20", name: "Du Maurier Short Pack (20s)", price: 38.0 },
    { id: "lm_white_20", name: "LM White pack (20s)", price: 28.0 },
    { id: "lm_white_10", name: "LM White ½ pack (10s)", price: 15.0 },
    { id: "lm_red_20", name: "LM Red pack (20s)", price: 24.0 },
    { id: "lm_red_10", name: "LM Red ½ pack (10s)", price: 13.0 },
    { id: "lm_purple_20", name: "LM Purple pack (20s)", price: 33.0 },
    { id: "lm_green_20", name: "LM Green pack (20s)", price: 33.0 },
    { id: "rothman_red_20", name: "Rothman Red pack (20s)", price: 23.0 },
    { id: "rothman_purple_20", name: "Rothman Purple pack (20s)", price: 31.0 },
    { id: "rothman_white_20", name: "Rothman White pack (20s)", price: 28.0 },
    { id: "mt_dor_20", name: "Mt Dor pack (20s)", price: 30.0 },
    { id: "dunhill_20", name: "Dunhill pack (20s)", price: 50.0 },
    { id: "dunhill_10", name: "Dunhill ½ pack (10s)", price: 26.0 },
    { id: "tabaca_20", name: "Tabaca pack (20s)", price: 14.0 },
    { id: "moment_20", name: "Moment pack (20s)", price: 15.0 },
    { id: "elegance_20", name: "Elegance pack (20s)", price: 16.0 },
    { id: "broadway_single", name: "Broadway single", price: 4.0 },
    { id: "du_maurier_single", name: "Du Maurier single", price: 3.0 },
    { id: "lm_single", name: "LM single", price: 2.0 },
    { id: "dollar_cig", name: "Dollar cigarette", price: 1.0 },
  ],
};

export const SHIFTS = {
  morning: { label: "Morning Shift", icon: "🌅", color: "#b45309", bg: "#fffbeb", accent: "#d97706" },
  evening: { label: "Evening Shift", icon: "🌙", color: "#1e40af", bg: "#eff6ff", accent: "#2563eb" },
};

export const ADMIN_PASSWORD = "admin123";

export function slugify(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") +
    "_" +
    Date.now()
  );
}

export function buildDefaultStock(items) {
  const stock = {};
  [...(items.alcohol || []), ...(items.cigarettes || [])].forEach((item) => {
    stock[item.id] = { opening: "", closing: "" };
  });
  return stock;
}
