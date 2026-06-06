/* =========================================================================
   engine.js — rdzeń silnika visual novel (maszyna stanów)
   --------------------------------------------------------------------------
   Przechodzi przez listę instrukcji (z parser.js) linia po linii, prowadzi
   flagi i zmienne, obsługuje branching, etykiety, wybory i audio.
   Wejście gracza (kliknięcia) jest centralizowane tutaj — prezentacja
   pożycza z niego prymitywy oczekiwania (sleepLubKlik / czekajNaKlik).
   ========================================================================= */

import { predkoscNaOpoznienie } from './settings.js';

export class Silnik {
  constructor({ skrypt, prezentacja, audio, historia, ustawienia, naKoniec, naZmianeStanu }) {
    this.instructions = skrypt.instructions;
    this.labels = skrypt.labels;
    this.present = prezentacja;
    this.audio = audio;
    this.historia = historia;
    this.ustawienia = ustawienia;
    this.naKoniec = naKoniec;             // callback: pokaż ekran zakończenia
    this.naZmianeStanu = naZmianeStanu;   // callback: aktualizuj przyciski auto/skip

    // Stan rozgrywki (to ląduje w zapisie)
    this.pc = 0;                  // program counter
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
      const instr = this.instructions[this.pc];
      this.pc++;
      const koniec = await this.wykonaj(instr);
      if (koniec) break; // np. @end albo @choice wstrzymują pętlę
    }
    this.dziala = false;
  }

  /* Wykonuje pojedynczą instrukcję. Zwraca true, gdy pętla ma się zatrzymać. */
  async wykonaj(instr) {
    switch (instr.typ) {
      case 'label':
        this.etykieta = instr.nazwa;
        return false;

      case 'bg':
        this.tlo = instr.nazwa;
        await this.present.ustawTlo(instr.nazwa, this.trybSkip ? 'cut' : instr.przejscie);
        return false;

      case 'show':
        this.sprites[instr.postac] = { pozycja: instr.pozycja, emocja: instr.emocja };
        this.present.pokazSprite(instr.postac, instr.pozycja, instr.emocja);
        return false;

      case 'hide':
        delete this.sprites[instr.postac];
        this.present.ukryjSprite(instr.postac);
        return false;

      case 'bgm':
        if (instr.stop) this.audio.stopBgm();
        else this.audio.graBgm(instr.nazwa);
        return false;

      case 'sfx':
        if (!this.trybSkip) this.audio.graSfx(instr.nazwa);
        return false;

      case 'wait':
        if (!this.trybSkip) await this.sleepLubKlik(instr.sekundy * 1000);
        return false;

      case 'set':
        this.zastosujSet(instr);
        return false;

      case 'flag':
        this.flagi[instr.nazwa] = instr.wartosc;
        return false;

      case 'anim':
        this.zastosujAnim(instr);
        return false;

      case 'if':
        if (this.ocenWarunek(instr.warunek)) this.skoczDo(instr.cel);
        return false;

      case 'jump':
        this.skoczDo(instr.cel);
        return false;

      case 'say': {
        const ctx = {
          opoznienie: predkoscNaOpoznienie(this.ustawienia.predkoscTekstu),
          trybSkip: this.trybSkip,
          sleepLubKlik: (ms) => this.sleepLubKlik(ms),
          czekajNaKlik: () => this.czekajNaKlik(),
        };
        const tekst = await this.present.wyswietlLinie(instr, ctx);
        this.widok = { mowiacy: instr.mowiacy, kolor: instr.kolor, tekst };
        this.historia.dodaj(instr.mowiacy, tekst);
        await this.czekajNaPostep();
        return false;
      }

      case 'choice':
        this.pokazWybory(instr.opcje);
        return true; // pętla wstrzymana do wyboru gracza

      case 'end':
        this.dziala = false;
        this.naKoniec?.(instr.nazwa);
        return true;

      default:
        console.warn('Nieznana instrukcja:', instr);
        return false;
    }
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
    this.present.pokazWybory(widoczne, (idx) => {
      this.skoczDo(widoczne[idx].cel);
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
