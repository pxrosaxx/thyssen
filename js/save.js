/* =========================================================================
   save.js — zapis i odczyt stanu gry (wiele slotów, localStorage)
   --------------------------------------------------------------------------
   Każdy slot zawiera PEŁNY stan gry, tak aby po wczytaniu ekran wyglądał
   dokładnie jak przed zapisem:
     - pc:        indeks bieżącej instrukcji w skrypcie
     - etykieta:  nazwa ostatniej etykiety (informacyjnie)
     - zmienne:   wszystkie $zmienne liczbowe
     - flagi:     ustawione flagi
     - tlo:       bieżące tło
     - sprites:   aktywne sprite'y { postac: {pozycja, emocja} }
     - bgm:       nazwa aktualnej muzyki (lub null)
     - historia:  log dialogów
     - widok:     ostatnio wyświetlana linia { mowiacy, kolor, tekst }
     - meta:      { data, podglad } do listy slotów
   ========================================================================= */

const PREFIKS = 'vn_save_';
export const LICZBA_SLOTOW = 6;

export function zapiszStan(numerSlotu, stan) {
  try {
    localStorage.setItem(PREFIKS + numerSlotu, JSON.stringify(stan));
    return true;
  } catch (e) {
    console.warn('Nie udało się zapisać stanu:', e);
    return false;
  }
}

export function wczytajStan(numerSlotu) {
  try {
    const zapis = localStorage.getItem(PREFIKS + numerSlotu);
    return zapis ? JSON.parse(zapis) : null;
  } catch (e) {
    console.warn('Nie udało się wczytać stanu:', e);
    return null;
  }
}

export function usunStan(numerSlotu) {
  localStorage.removeItem(PREFIKS + numerSlotu);
}

/* Zwraca listę metadanych wszystkich slotów (do wyświetlenia). */
export function listaSlotow() {
  const lista = [];
  for (let i = 1; i <= LICZBA_SLOTOW; i++) {
    const stan = wczytajStan(i);
    lista.push({
      numer: i,
      pusty: !stan,
      meta: stan ? stan.meta : null,
    });
  }
  return lista;
}
