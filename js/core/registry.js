/* =========================================================================
   core/registry.js — rejestr komend (Command Registry)
   --------------------------------------------------------------------------
   Filar B architektury. Zastępuje twardo zaszyte switch-e w parserze i
   silniku. Każda komenda skryptu (@bg, @show, @set, ...) jest REJESTROWANA
   przez moduł, który dostarcza:
     - parsuj(komenda, reszta, slowa, kontekst) -> obiekt instrukcji | null
     - wykonaj(instr, silnik) -> bool (true = wstrzymaj główną pętlę)

   Dodanie nowego systemu = rejestracja jego komend tutaj, bez ruszania
   parsera ani silnika. To jest mechanizm, który czyni platformę
   rozszerzalną „w nieskończoność".
   ========================================================================= */

export class Rejestr {
  constructor() {
    this.parsery = {};    // nazwaKomendy -> parsuj(...)
    this.wykonawcy = {};  // typInstrukcji -> wykonaj(...)
  }

  /* Rejestruje definicję komendy/instrukcji.
     def = {
       komendy: ['bg'],          // nazwy @-komend, które parsuje (opcjonalne)
       typy:    ['bg'],          // typy instrukcji, które wykonuje (opcjonalne)
       parsuj,                   // (komenda, reszta, slowa, kontekst) -> instr|null
       wykonaj,                  // (instr, silnik) -> bool
     }                                                                       */
  zarejestruj(def) {
    if (def.parsuj) {
      for (const k of def.komendy || []) this.parsery[k] = def.parsuj;
    }
    if (def.wykonaj) {
      for (const t of def.typy || []) this.wykonawcy[t] = def.wykonaj;
    }
  }

  maKomende(komenda) {
    return komenda in this.parsery;
  }

  /* Parsowanie linii @-komendy. Zwraca obiekt instrukcji albo null
     (np. @char tylko mutuje manifest i nie produkuje instrukcji). */
  parsujKomende(komenda, reszta, slowa, kontekst) {
    const fn = this.parsery[komenda];
    if (!fn) throw new Error(`nieznana komenda @${komenda}`);
    return fn(komenda, reszta, slowa, kontekst);
  }

  /* Wykonanie instrukcji przez zarejestrowanego wykonawcę. */
  wykonaj(instr, silnik) {
    const fn = this.wykonawcy[instr.typ];
    if (!fn) {
      console.warn('Brak zarejestrowanego wykonawcy dla typu instrukcji:', instr.typ);
      return false;
    }
    return fn(instr, silnik);
  }
}
