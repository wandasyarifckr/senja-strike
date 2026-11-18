// Satu tempat untuk seluruh state permainan: ronde, ekonomi, tim, bom, dan skor.
// Modul lain membaca/menulis lewat objek ini, tidak menyimpan salinan sendiri.
export const ROUND_TIME = 100; // detik per ronde
export const BUY_TIME = 15; // detik fase beli antar ronde
export const BOMB_TIME = 35; // detik sumbu bom setelah plant
export const PLANT_TIME = 3; // detik menanam bom
export const DEFUSE_TIME = 5; // detik menjinakkan bom
export const ROUNDS_TO_WIN = 7;
export const MAX_ROUNDS = 13;

export const WEAPONS = {
  p9: { id: 'p9', name: 'P9 Sidearm', price: 0, mag: 12, reserve: 36, damage: 26, headMul: 3.2, rate: 0.16, reload: 1.4, auto: false, spread: 0.011, moveSpread: 0.02, recoil: 0.006, range: 60, zoom: 1 },
  kr7: { id: 'kr7', name: 'KR-7 Rifle', price: 2700, mag: 30, reserve: 90, damage: 33, headMul: 4.0, rate: 0.1, auto: true, spread: 0.006, moveSpread: 0.028, recoil: 0.011, range: 90, zoom: 1 },
  sg12: { id: 'sg12', name: 'SG-12 Scatter', price: 1700, mag: 6, reserve: 24, damage: 14, headMul: 2.0, rate: 0.85, auto: false, spread: 0.045, moveSpread: 0.05, recoil: 0.03, range: 22, zoom: 1, pellets: 8 },
  sr9: { id: 'sr9', name: 'SR-9 Marksman', price: 3200, mag: 5, reserve: 15, damage: 82, headMul: 4.0, rate: 1.15, auto: false, spread: 0.001, moveSpread: 0.06, recoil: 0.05, range: 120, zoom: 2.2 },
};
export const GRENADE_PRICE = { frag: 300, smoke: 300 };
export const ARMOR_PRICE = 650;

export function createState() {
  return {
    phase: 'menu', // menu | buy | play | roundEnd | matchEnd
    round: 1,
    score: { atk: 0, def: 0 }, // atk = tim pemain (Elang), def = Serigala
    timer: BUY_TIME,
    money: 800,
    kills: 0,
    deaths: 0,
    plants: 0,
    defuses: 0,
    lossStreak: 0,
    bomb: { state: 'carry', site: null, x: 0, z: 0, timer: 0, planter: null, defuser: null, progress: 0 },
    alive: { atk: 0, def: 0 },
    winner: null,
    matchWinner: null,
    time: 0,
    muted: false,
  };
}

// Hadiah ekonomi ala taktis: menang besar, kalah tetap dapat jatah (naik tiap kalah beruntun).
export function roundReward(won, lossStreak) {
  if (won) return 3250;
  return 1900 + Math.min(lossStreak, 4) * 500;
}
