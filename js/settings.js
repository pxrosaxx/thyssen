/* =========================================================================
   settings.js — ustawienia gry (przechowywane OSOBNO od zapisów stanu)
   --------------------------------------------------------------------------
   Klucz localStorage: "vn_settings". Zawiera:
     - predkoscTekstu: 0..100 (procent szybkości maszyny do pisania)
     - glosnoscBgm:    0..1
     - glosnoscSfx:    0..1
   ========================================================================= */

const KLUCZ = 'vn_settings';

const DOMYSLNE = {
  predkoscTekstu: 60,
  glosnoscBgm: 0.7,
  glosnoscSfx: 0.8,
};

export function wczytajUstawienia() {
  try {
    const zapis = localStorage.getItem(KLUCZ);
    if (zapis) return { ...DOMYSLNE, ...JSON.parse(zapis) };
  } catch (e) {
    console.warn('Nie udało się wczytać ustawień:', e);
  }
  return { ...DOMYSLNE };
}

export function zapiszUstawienia(ustawienia) {
  try {
    localStorage.setItem(KLUCZ, JSON.stringify(ustawienia));
  } catch (e) {
    console.warn('Nie udało się zapisać ustawień:', e);
  }
}

/* Przelicza suwak 0..100 na opóźnienie między znakami (ms).
   Większa wartość suwaka = szybszy tekst = mniejsze opóźnienie. */
export function predkoscNaOpoznienie(predkosc0do100) {
  const min = 5;    // najszybszy
  const max = 80;   // najwolniejszy
  return Math.round(max - (predkosc0do100 / 100) * (max - min));
}
