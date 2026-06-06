/* =========================================================================
   presentation.js — warstwa prezentacji
   --------------------------------------------------------------------------
   Odpowiada za to, co widać i słychać po stronie DOM:
     - tła i sprite'y (na start CSS-owe placeholdery, bez grafik)
     - przejścia fade-in / fade-out
     - okno dialogowe z efektem maszyny do pisania (regulowana prędkość)
     - menu wyborów
   Logika fabuły (flagi, skoki) jest w engine.js — tu tylko rysujemy.
   ========================================================================= */

/* Stabilny kolor placeholdera wyliczony z nazwy (żeby tła/postacie
   miały spójne, rozróżnialne barwy bez grafik). */
function kolorZNazwy(nazwa, jasnosc = 45) {
  let h = 0;
  for (let i = 0; i < nazwa.length; i++) h = (h * 31 + nazwa.charCodeAt(i)) % 360;
  return `hsl(${h}, 35%, ${jasnosc}%)`;
}

const POZYCJE = ['left', 'center', 'right'];

export class Prezentacja {
  constructor() {
    this.warstwaTla = document.getElementById('warstwa-tla');
    this.warstwaPostaci = document.getElementById('warstwa-postaci');
    this.oknoDialogowe = document.getElementById('okno-dialogowe');
    this.elImie = document.getElementById('imie-mowiacego');
    this.elTekst = document.getElementById('tekst-dialogu');
    this.elWskaznik = document.getElementById('wskaznik-dalej');
    this.menuWyborow = document.getElementById('menu-wyborow');

    this.sloty = {};
    POZYCJE.forEach(p => {
      this.sloty[p] = this.warstwaPostaci.querySelector(`.slot-sprite[data-pos="${p}"]`);
    });

    // Manifest postaci (konfiguracja animacji per postać) — ustawiany z main.js
    this.characters = {};
    // Aktywne sprite'y na scenie: postac -> { kontener, cialo, usta..., flap... }
    this.aktywneSprites = {};
  }

  /* Podaje silnikowi prezentacji konfigurację postaci (oddech, flap, warianty ust). */
  ustawManifest(characters) {
    this.characters = characters || {};
  }

  /* --------------------------------------------------------------------- */
  /* Tło                                                                   */
  /* --------------------------------------------------------------------- */
  async ustawTlo(nazwa, przejscie = 'fade') {
    const zastosuj = () => {
      this.warstwaTla.style.backgroundColor = nazwa ? kolorZNazwy(nazwa, 22) : '#0a0a0c';
      this.warstwaTla.textContent = nazwa || '';
    };
    if (przejscie === 'cut') {
      zastosuj();
      return;
    }
    this.warstwaTla.classList.add('zanikanie');
    await opoznienie(300);
    zastosuj();
    this.warstwaTla.classList.remove('zanikanie');
    await opoznienie(300);
  }

  /* --------------------------------------------------------------------- */
  /* Sprite'y postaci + animacja (oddech, ruch ust)                        */
  /* --------------------------------------------------------------------- */

  /* Tworzy sprite z domyślną animacją oddechu i warstwą ust.
     Struktura DOM:
       .placeholder-sprite  -> wrapper: fade + animacja wejścia (opacity/translate)
         .sprite-cialo      -> ciało: kolor/etykiety + zapętlona animacja oddechu
           .sprite-usta(-img) -> warstwa ust (flap)                              */
  pokazSprite(postac, pozycja = 'center', emocja = 'neutralny') {
    const cfg = this.characters[postac] || {};
    const slot = this.sloty[pozycja] || this.sloty.center;
    this._usunZeSlotow(postac); // ta sama postać nie może być w dwóch slotach
    slot.innerHTML = '';

    const kontener = document.createElement('div');
    kontener.className = 'placeholder-sprite';
    kontener.dataset.postac = postac;

    const cialo = document.createElement('div');
    cialo.className = 'sprite-cialo';
    cialo.style.backgroundColor = kolorZNazwy(postac, 50);
    cialo.innerHTML = `<span class="etykieta-imie">${postac}</span>`;

    // Warstwa ust: warianty graficzne (jeśli podane) albo placeholder CSS.
    let ustaEl = null, ustaPlaceholder = null;
    if (cfg.ustaOtwarte && cfg.ustaZamkniete) {
      ustaEl = document.createElement('div');
      ustaEl.className = 'sprite-usta-img';
      ustaEl.style.backgroundImage = `url("${cfg.ustaZamkniete}")`;
      cialo.appendChild(ustaEl);
    } else {
      // Placeholder syntezuje dwie klatki ust, by flap był widoczny bez assetów.
      ustaPlaceholder = document.createElement('div');
      ustaPlaceholder.className = 'sprite-usta';
      cialo.appendChild(ustaPlaceholder);
    }

    cialo.insertAdjacentHTML('beforeend', `<span class="etykieta-emocji">(${emocja})</span>`);

    // Oddech (idle): zapętlona animacja CSS z parametrami per postać.
    const tempo = cfg.oddechTempo != null ? cfg.oddechTempo : 3.6;
    const amp = cfg.oddechAmp != null ? cfg.oddechAmp : 1.0;
    if (cfg.oddech !== false) {
      cialo.style.setProperty('--odd-amp', amp + 'cqh');
      cialo.style.setProperty('--odd-rot', (amp * 0.6) + 'deg');
      cialo.style.animation = `oddech ${tempo}s ease-in-out infinite`;
    }

    kontener.appendChild(cialo);
    slot.appendChild(kontener);
    requestAnimationFrame(() => kontener.classList.add('widoczny'));

    this.aktywneSprites[postac] = {
      slot: pozycja, kontener, cialo, ustaEl, ustaPlaceholder,
      ustaOtwarte: cfg.ustaOtwarte, ustaZamkniete: cfg.ustaZamkniete,
      flap: cfg.flap !== false,                         // flap domyślnie włączony
      flapTempo: cfg.flapTempo != null ? cfg.flapTempo : 175,
      flapInterval: null,
      tempo,                                            // bazowy okres oddechu (do presetów @anim)
    };
  }

  ukryjSprite(postac) {
    this.zatrzymajFlap(postac);
    POZYCJE.forEach(p => {
      const el = this.sloty[p].querySelector('.placeholder-sprite');
      if (el && el.dataset.postac === postac) {
        el.classList.remove('widoczny');
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 500);
      }
    });
    delete this.aktywneSprites[postac];
  }

  /* Usuwa istniejące wystąpienie postaci ze wszystkich slotów (bez fade). */
  _usunZeSlotow(postac) {
    this.zatrzymajFlap(postac);
    POZYCJE.forEach(p => {
      const el = this.sloty[p].querySelector('.placeholder-sprite');
      if (el && el.dataset.postac === postac) el.remove();
    });
  }

  /* Czyści wszystkie sprite'y (np. przy restarcie/wczytaniu). */
  wyczyscSprites() {
    Object.keys(this.aktywneSprites).forEach(p => this.zatrzymajFlap(p));
    this.aktywneSprites = {};
    POZYCJE.forEach(p => { this.sloty[p].innerHTML = ''; });
  }

  /* Odtwarza zestaw sprite'ów z zapisu wraz z nadpisaniami animacji (@anim). */
  przywrocSprites(mapa) {
    this.wyczyscSprites();
    for (const postac in mapa) {
      const { pozycja, emocja, anim } = mapa[postac];
      this.pokazSprite(postac, pozycja, emocja);
      if (anim) {
        if (anim.tempo != null) this.sterujAnimacja(postac, 'oddech', anim.tempo);
        if (anim.oddech === 'stop') this.sterujAnimacja(postac, 'oddech', 'stop');
      }
    }
  }

  /* --- Ruch ust (flap) spięty z maszyną do pisania --- */

  /* Startuje flap dla mówiącej postaci. No-op gdy postać nie jest na scenie,
     flap wyłączony, albo mówiącym jest narrator (postac == null).           */
  rozpocznijFlap(postac) {
    const wpis = postac && this.aktywneSprites[postac];
    if (!wpis || !wpis.flap) return;
    this.zatrzymajFlap(postac);
    let otwarte = false;
    wpis.flapInterval = setInterval(() => {
      otwarte = !otwarte;
      this._ustawUsta(wpis, otwarte);
    }, wpis.flapTempo);
  }

  /* Zatrzymuje flap i NATYCHMIAST zamyka usta (pauza, koniec linii, klik). */
  zatrzymajFlap(postac) {
    const wpis = postac && this.aktywneSprites[postac];
    if (!wpis) return;
    if (wpis.flapInterval) { clearInterval(wpis.flapInterval); wpis.flapInterval = null; }
    this._ustawUsta(wpis, false);
  }

  _ustawUsta(wpis, otwarte) {
    if (wpis.ustaEl) {
      wpis.ustaEl.style.backgroundImage = `url("${otwarte ? wpis.ustaOtwarte : wpis.ustaZamkniete}")`;
    } else if (wpis.ustaPlaceholder) {
      wpis.ustaPlaceholder.classList.toggle('otwarte', otwarte);
    }
  }

  /* --- Sterowanie animacją ze skryptu (@anim) — nadpisuje stan oddechu --- */
  sterujAnimacja(postac, wlasciwosc, wartosc) {
    const wpis = this.aktywneSprites[postac];
    if (!wpis || wlasciwosc !== 'oddech') return;
    const cialo = wpis.cialo;
    switch (wartosc) {
      case 'stop':
        cialo.style.animationPlayState = 'paused';
        break;
      case 'start':
      case 'wznow':
        cialo.style.animationPlayState = 'running';
        break;
      case 'szybki':
        cialo.style.animationDuration = (wpis.tempo * 0.45) + 's';
        cialo.style.animationPlayState = 'running';
        break;
      case 'spokojny':
        cialo.style.animationDuration = (wpis.tempo * 1.7) + 's';
        cialo.style.animationPlayState = 'running';
        break;
      case 'normalny':
        cialo.style.animationDuration = wpis.tempo + 's';
        cialo.style.animationPlayState = 'running';
        break;
      default: {
        const n = parseFloat(wartosc);
        if (!isNaN(n)) {
          cialo.style.animationDuration = n + 's';
          cialo.style.animationPlayState = 'running';
        }
      }
    }
  }

  /* --------------------------------------------------------------------- */
  /* Okno dialogowe + maszyna do pisania                                   */
  /* --------------------------------------------------------------------- */
  pokazOkno(widoczne) {
    this.oknoDialogowe.classList.toggle('ukryte', !widoczne);
  }

  pokazWskaznik(widoczny) {
    this.elWskaznik.classList.toggle('aktywny', widoczny);
  }

  /* Ustawia nazwę mówiącego (z kolorem) lub czyści dla narracji. */
  ustawImie(mowiacy, kolor) {
    if (mowiacy) {
      this.elImie.textContent = mowiacy;
      this.elImie.style.color = kolor || 'var(--kolor-tekst)';
    } else {
      this.elImie.textContent = '';
    }
  }

  /* Natychmiast pokazuje całą linię (używane po wczytaniu zapisu). */
  pokazPelnaLinie(mowiacy, kolor, tekst) {
    this.pokazOkno(true);
    this.ustawImie(mowiacy, kolor);
    this.elTekst.textContent = tekst;
  }

  /* Wyświetla linię z efektem maszyny do pisania, obsługując pauzy inline.
     ctx = { opoznienie, trybSkip, sleepLubKlik, czekajNaKlik }
     Zwraca pełny wyrenderowany tekst (do logu i zapisu widoku).        */
  async wyswietlLinie(linia, ctx) {
    this.pokazOkno(true);
    this.pokazWskaznik(false);
    this.ustawImie(linia.mowiacy, linia.kolor);
    this.elTekst.textContent = '';
    let pelnyTekst = '';
    // Usta ruszają się TYLKO podczas aktywnego wypisywania tekstu tej postaci.
    const mowiaca = linia.mowiacy;

    for (const segment of linia.segmenty) {
      if (segment.typ === 'tekst') {
        this.rozpocznijFlap(mowiaca);
        pelnyTekst += await this.wpiszTekst(segment.tekst, ctx);
        this.zatrzymajFlap(mowiaca);          // tekst stanął -> usta natychmiast zamknięte
      } else if (segment.typ === 'czas') {
        if (!ctx.trybSkip) await ctx.sleepLubKlik(segment.sekundy * 1000);
      } else if (segment.typ === 'klik') {
        if (!ctx.trybSkip) {
          this.pokazWskaznik(true);
          await ctx.czekajNaKlik();
          this.pokazWskaznik(false);
        }
      }
    }
    this.zatrzymajFlap(mowiaca);              // gwarancja: usta zamknięte po linii
    return pelnyTekst;
  }

  /* Wpisuje pojedynczy fragment tekstu znak po znaku.
     Kliknięcie w trakcie ujawnia resztę fragmentu natychmiast. */
  async wpiszTekst(tekst, ctx) {
    if (ctx.trybSkip) {
      this.elTekst.textContent += tekst;
      return tekst;
    }
    for (let i = 0; i < tekst.length; i++) {
      this.elTekst.textContent += tekst[i];
      const przerwano = await ctx.sleepLubKlik(ctx.opoznienie);
      if (przerwano) {
        this.elTekst.textContent += tekst.slice(i + 1);
        break;
      }
    }
    return tekst;
  }

  /* --------------------------------------------------------------------- */
  /* Menu wyborów                                                          */
  /* --------------------------------------------------------------------- */
  pokazWybory(opcje, naWybor) {
    this.menuWyborow.innerHTML = '';
    this.menuWyborow.classList.remove('ukryte');
    opcje.forEach((opcja, idx) => {
      const btn = document.createElement('button');
      btn.textContent = opcja.tekst;
      btn.addEventListener('click', () => {
        this.menuWyborow.classList.add('ukryte');
        this.menuWyborow.innerHTML = '';
        naWybor(idx);
      });
      this.menuWyborow.appendChild(btn);
    });
  }
}

/* Proste opóźnienie pomocnicze (nie da się przerwać kliknięciem). */
export function opoznienie(ms) {
  return new Promise(res => setTimeout(res, ms));
}
