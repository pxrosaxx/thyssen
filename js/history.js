/* =========================================================================
   history.js — log / historia dialogów
   --------------------------------------------------------------------------
   Przechowuje wszystkie wypowiedzi i narrację w kolejności, by gracz
   mógł przewinąć rozmowę w tył. Historia jest częścią zapisu stanu.
   ========================================================================= */

export class Historia {
  constructor() {
    this.wpisy = []; // { mowiacy: string|null, tekst: string }
  }

  dodaj(mowiacy, tekst) {
    this.wpisy.push({ mowiacy, tekst });
  }

  wyczysc() {
    this.wpisy = [];
  }

  /* Zwraca kopię do zapisu w stanie gry. */
  doZapisu() {
    return this.wpisy.slice();
  }

  /* Odtwarza historię z zapisu. */
  zZapisu(wpisy) {
    this.wpisy = Array.isArray(wpisy) ? wpisy.slice() : [];
  }
}
