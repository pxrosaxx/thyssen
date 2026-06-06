/* =========================================================================
   audio.js — menedżer dźwięku (HTML5 Audio)
   --------------------------------------------------------------------------
   Dwa niezależne kanały:
     - BGM: jedna zapętlona ścieżka w tle (można zmienić/zatrzymać)
     - SFX: jednorazowe efekty (kilka może zagrać równolegle)
   Pliki dźwiękowe są opcjonalne — gdy ich brak, silnik działa po cichu.
   ========================================================================= */

export class MenedzerAudio {
  constructor() {
    this.bgm = null;            // bieżący obiekt Audio dla muzyki
    this.nazwaBgm = null;       // nazwa aktualnej ścieżki (do zapisu stanu)
    this.glosnoscBgm = 0.7;
    this.glosnoscSfx = 0.8;
    this.sciezkaBgm = 'assets/audio/bgm/';
    this.sciezkaSfx = 'assets/audio/sfx/';
    this.rozszerzenie = '.mp3';
  }

  /* Odtwarza (lub zmienia) muzykę w tle z zapętleniem. */
  graBgm(nazwa) {
    if (this.nazwaBgm === nazwa && this.bgm) return; // już gra to samo
    this.stopBgm();
    this.nazwaBgm = nazwa;
    const audio = new Audio(this.sciezkaBgm + nazwa + this.rozszerzenie);
    audio.loop = true;
    audio.volume = this.glosnoscBgm;
    // Pliki mogą nie istnieć (placeholdery) — błąd odtwarzania ignorujemy.
    audio.play().catch(() => {});
    this.bgm = audio;
  }

  stopBgm() {
    if (this.bgm) {
      this.bgm.pause();
      this.bgm = null;
    }
    this.nazwaBgm = null;
  }

  /* Jednorazowy efekt dźwiękowy. */
  graSfx(nazwa) {
    const audio = new Audio(this.sciezkaSfx + nazwa + this.rozszerzenie);
    audio.volume = this.glosnoscSfx;
    audio.play().catch(() => {});
  }

  ustawGlosnoscBgm(v) {
    this.glosnoscBgm = v;
    if (this.bgm) this.bgm.volume = v;
  }

  ustawGlosnoscSfx(v) {
    this.glosnoscSfx = v;
  }
}
