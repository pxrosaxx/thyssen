/* =========================================================================
   core/bus.js — magistrala zdarzeń (Event Bus)
   --------------------------------------------------------------------------
   Filar A architektury. Rdzeń (engine) emituje zdarzenia cyklu życia gry,
   a moduły TYLKO nasłuchują — bez zależności w drugą stronę. Dzięki temu
   kolejne systemy (dziennik, galeria, kodeks, śledzenie przeczytanych linii,
   autosave, tracking zakończeń) wpinają się bez dotykania silnika.

   Nazwy zdarzeń (umowa):
     onStart            — rozpoczęto nową grę
     onLabel(nazwa)     — wejście do etykiety/sekcji
     onLineShown({mowiacy, tekst, indeks})  — wyświetlono linię dialogu/narracji
     onBgChange(nazwa)  — zmiana tła
     onChoiceShown(opcje)   — pokazano menu wyboru
     onChoiceMade(opcja)    — gracz dokonał wyboru
     onStateChange({klucz, stara, nowa})    — zmiana stanu (flaga/zmienna)
     onEnd(nazwa)       — osiągnięto zakończenie
   ========================================================================= */

export class Bus {
  constructor() {
    this.sluchacze = {}; // nazwaZdarzenia -> [funkcje]
  }

  /* Subskrybuje zdarzenie. Zwraca funkcję odpinającą. */
  on(nazwa, fn) {
    (this.sluchacze[nazwa] ||= []).push(fn);
    return () => this.off(nazwa, fn);
  }

  off(nazwa, fn) {
    const lista = this.sluchacze[nazwa];
    if (!lista) return;
    const i = lista.indexOf(fn);
    if (i !== -1) lista.splice(i, 1);
  }

  /* Emituje zdarzenie do wszystkich słuchaczy. Błąd słuchacza nie może
     wywrócić rozgrywki — łapiemy i logujemy. */
  emit(nazwa, dane) {
    const lista = this.sluchacze[nazwa];
    if (!lista) return;
    for (const fn of lista.slice()) {
      try { fn(dane); }
      catch (e) { console.error(`Słuchacz zdarzenia "${nazwa}" rzucił błąd:`, e); }
    }
  }
}
