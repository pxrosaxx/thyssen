/* =========================================================================
   engine.js — rdzeń silnika visual novel (maszyna stanów)
   --------------------------------------------------------------------------
   Przechodzi przez listę instrukcji (z parser.js) linia po linii, prowadzi
   flagi i zmienne, obsługuje branching, etykiety, wybory i audio.
   Wejście gracza (kliknięcia) jest centralizowane tutaj — prezentacja
   pożycza z niego prymitywy oczekiwania (sleepLubKlik / czekajNaKlik).

   Po Fazie 0 silnik NIE zawiera już switcha po typach instrukcji — wykonanie
   każdej instrukcji deleguje do REJESTRU komend, a w punktach cyklu życia
   emituje zdarzenia na MAGISTRALI (bus). Metody pomocnicze (skoczDo,
   zastosujSet, ocenWarunek, zastosujAnim, pokazWybory) zostają tutaj, bo
   korzystają z nich wykonawcy komend.
   ========================================================================= */

export class Silnik {
  constructor({ skrypt, prezentacja, audio, historia, ustawienia, rejestr, bus, naKoniec, naZmianeStanu }) {
    this.instructions = skrypt.instructions;
    this.labels = skrypt.labels;
    this.present = prezentacja;
    this.audio = audio;
    this.historia = historia;
    this.ustawienia = ustawienia;
    this.rejestr = rejestr;               // rejestr komend (wykonawcy)
    this.bus = bus;                       // magistrala zdarzeń
    this.naKoniec = naKoniec;             // callback: pokaż ekran zakończenia
    this.naZmianeStanu = naZmianeStanu;   // callback: aktualizuj przyciski auto/skip

    // Stan rozgrywki (to ląduje w zapisie)
    this.pc = 0;                  // program counter
    this.aktualnyIndeks = 0;     // indeks instrukcji aktualnie wykonywanej
    this.etykieta = '';          // ostatnia etykieta (informacyjnie)
    this.zmienne = {};           // $zmienne liczbowe
    this.flagi = {};             // flagi (bool)
    this.tlo = null;             // aktualne tło
    this.sprites = {};           // { postac: {pozycja, emocja} }
    this.widok = null;           // { mowiacy, kolor, tekst } — ostatnia linia

    // Tryby
    this.trybAuto = false;
    this.trybSkip = false;

    // Sterowanie wykonaniem
    this.dziala = false;
    this.oczekiwanie = null;     // bieżąca funkcja rozwiązująca oczekiwanie na klik
    this.czekanaPostepu = false; // czy czekamy na "dalej" (klik posuwa fabułę)
  }

  /* --------------------------------------------------------------------- */
  /* Wejście gracza                                                        */
  /* --------------------------------------------------------------------- */

  /* Wywoływane przez klik/tap na scenie albo klawisz. */
  naKlik() {
    if (this.oczekiwanie) {
      const fn = this.oczekiwanie;
      this.oczekiwanie = null;
      fn();
    }
  }

  /* Czeka na kliknięcie gracza (pauza inline {w}, postęp do następnej linii). */
  czekajNaKlik() {
    return new Promise(res => { this.oczekiwanie = res; });
  }

  /* Czeka ms milisekund albo do kliknięcia — zwraca true gdy przerwano klikiem. */
  sleepLubKlik(ms) {
    return new Promise(res => {
      const t = setTimeout(() => { this.oczekiwanie = null; res(false); }, ms);
      this.oczekiwanie = () => { clearTimeout(t); res(true); };
    });
  }

  /* Czeka na "dalej" zależnie od trybu (zwykły / auto / skip). */
  async czekajNaPostep() {
    this.czekanaPostepu = true;
    this.present.pokazWskaznik(true);
    if (this.trybSkip) await this.sleepLubKlik(20);
    else if (this.trybAuto) await this.sleepLubKlik(1600);
    else await this.czekajNaKlik();
    this.present.pokazWskaznik(false);
    this.czekanaPostepu = false;
  }

  ustawAuto(v) { this.trybAuto = v; if (v) this.trybSkip = false; this.naZmianeStanu?.(); this.naKlik(); }
  ustawSkip(v) { this.trybSkip = v; if (v) this.trybAuto = false; this.naZmianeStanu?.(); this.naKlik(); }

  /* --------------------------------------------------------------------- */
  /* Start / skok                                                          */
  /* --------------------------------------------------------------------- */

  /* Rozpoczyna nową grę od początku skryptu. */
  start() {
    this.pc = 0;
    this.zmienne = {};
    this.flagi = {};
    this.tlo = null;
    this.sprites = {};
    this.widok = null;
    this.historia.wyczysc();
    this.present.wyczyscSprites();
    this.bus.emit('onStart');
    this.uruchom();
  }

  skoczDo(etykieta) {
    if (!(etykieta in this.labels)) {
      throw new Error(`Nieznana etykieta skoku: "${etykieta}"`);
    }
    this.pc = this.labels[etykieta];
    this.etykieta = etykieta;
  }

  /* --------------------------------------------------------------------- */
  /* Główna pętla wykonania                                                */
  /* --------------------------------------------------------------------- */
  async uruchom() {
    if (this.dziala) return;
    this.dziala = true;
    while (this.dziala && this.pc < this.instructions.length) {
      this.aktualnyIndeks = this.pc;
      const instr = this.instructions[this.pc];
      this.pc++;
      // Wykonanie instrukcji deleguje do rejestru komend (Filar B).
      const koniec = await this.rejestr.wykonaj(instr, this);
      if (koniec) break; // np. @end albo @choice wstrzymują pętlę
    }
    this.dziala = false;
  }

  zastosujSet(instr) {
    const aktualna = this.zmienne[instr.nazwa] || 0;
    let nowa;
    switch (instr.operator) {
      case '=':  nowa = instr.wartosc; break;
      case '+=': nowa = aktualna + instr.wartosc; break;
      case '-=': nowa = aktualna - instr.wartosc; break;
      case '*=': nowa = aktualna * instr.wartosc; break;
      case '/=': nowa = instr.wartosc !== 0 ? aktualna / instr.wartosc : aktualna; break;
      default:   nowa = aktualna;
    }
    this.zmienne[instr.nazwa] = nowa;
  }

  /* Stosuje @anim: nadpisuje stan animacji żywego sprite'a ORAZ zapisuje
     nadpisanie w stanie sprite'a, by zapis/wczytanie je odtworzyły. */
  zastosujAnim(instr) {
    const s = this.sprites[instr.postac];
    if (s && instr.wlasciwosc === 'oddech') {
      s.anim = s.anim || { oddech: 'run', tempo: null };
      const w = instr.wartosc;
      if (w === 'stop') s.anim.oddech = 'stop';
      else if (w === 'start' || w === 'wznow') s.anim.oddech = 'run';
      else if (w === 'normalny') { s.anim.oddech = 'run'; s.anim.tempo = null; }
      else s.anim.tempo = w; // 'szybki' | 'spokojny' | liczba (sekundy)
    }
    this.present.sterujAnimacja(instr.postac, instr.wlasciwosc, instr.wartosc);
  }

  ocenWarunek(warunek) {
    if (warunek.rodzaj === 'flaga') {
      const ustawiona = !!this.flagi[warunek.nazwa];
      return warunek.negacja ? !ustawiona : ustawiona;
    }
    // rodzaj === 'zmienna'
    const v = this.zmienne[warunek.nazwa] || 0;
    switch (warunek.operator) {
      case '==': return v === warunek.wartosc;
      case '!=': return v !== warunek.wartosc;
      case '>':  return v >  warunek.wartosc;
      case '<':  return v <  warunek.wartosc;
      case '>=': return v >= warunek.wartosc;
      case '<=': return v <= warunek.wartosc;
      default:   return false;
    }
  }

  pokazWybory(opcje) {
    // odfiltruj opcje, których warunek widoczności nie jest spełniony
    const widoczne = opcje.filter(o => !o.warunek || this.ocenWarunek(o.warunek));
    this.bus.emit('onChoiceShown', widoczne);
    this.present.pokazWybory(widoczne, (idx) => {
      const wybrana = widoczne[idx];
      this.bus.emit('onChoiceMade', wybrana);
      this.skoczDo(wybrana.cel);
      this.uruchom();
    });
  }

  /* --------------------------------------------------------------------- */
  /* Zapis / wczytanie stanu                                               */
  /* --------------------------------------------------------------------- */

  /* Buduje pełny snapshot stanu do zapisu w slocie. */
  doZapisu() {
    const podglad = this.widok ? this.widok.tekst.slice(0, 60) : '(początek)';
    return {
      pc: this.pc,
      etykieta: this.etykieta,
      zmienne: { ...this.zmienne },
      flagi: { ...this.flagi },
      tlo: this.tlo,
      sprites: JSON.parse(JSON.stringify(this.sprites)),
      bgm: this.audio.nazwaBgm,
      historia: this.historia.doZapisu(),
      widok: this.widok ? { ...this.widok } : null,
      meta: {
        data: new Date().toISOString(),
        podglad: (this.widok && this.widok.mowiacy ? this.widok.mowiacy + ': ' : '') + podglad,
      },
    };
  }

  /* Odtwarza stan z zapisu tak, by ekran wyglądał jak przed zapisem. */
  wczytajZeStanu(stan) {
    this.dziala = false;
    this.pc = stan.pc;
    this.etykieta = stan.etykieta || '';
    this.zmienne = { ...stan.zmienne };
    this.flagi = { ...stan.flagi };
    this.tlo = stan.tlo;
    this.sprites = JSON.parse(JSON.stringify(stan.sprites || {}));
    this.widok = stan.widok || null;
    this.historia.zZapisu(stan.historia);

    // odtworzenie warstwy prezentacji
    this.present.ustawTlo(this.tlo, 'cut');
    this.present.przywrocSprites(this.sprites);
    if (this.widok) {
      this.present.pokazPelnaLinie(this.widok.mowiacy, this.widok.kolor, this.widok.tekst);
    } else {
      this.present.pokazOkno(false);
    }

    // odtworzenie muzyki
    if (stan.bgm) this.audio.graBgm(stan.bgm);
    else this.audio.stopBgm();

    // Czekamy aż gracz kliknie "dalej", potem wznawiamy od zapisanego pc.
    this.wznowPoWczytaniu();
  }

  async wznowPoWczytaniu() {
    await this.czekajNaPostep();
    this.uruchom();
  }
}
