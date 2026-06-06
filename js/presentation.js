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
  /* Sprite'y postaci                                                      */
  /* --------------------------------------------------------------------- */
  pokazSprite(postac, pozycja = 'center', emocja = 'neutralny') {
    const slot = this.sloty[pozycja] || this.sloty.center;
    slot.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'placeholder-sprite';
    el.style.backgroundColor = kolorZNazwy(postac, 50);
    el.dataset.postac = postac;
    el.innerHTML = `<span class="etykieta-imie">${postac}</span>` +
                   `<span class="etykieta-emocji">(${emocja})</span>`;
    slot.appendChild(el);
    // wymuszenie reflow, by zadziałał fade-in
    requestAnimationFrame(() => el.classList.add('widoczny'));
  }

  ukryjSprite(postac) {
    POZYCJE.forEach(p => {
      const el = this.sloty[p].querySelector('.placeholder-sprite');
      if (el && el.dataset.postac === postac) {
        el.classList.remove('widoczny');
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 500);
      }
    });
  }

  /* Czyści wszystkie sprite'y (np. przy restarcie/wczytaniu). */
  wyczyscSprites() {
    POZYCJE.forEach(p => { this.sloty[p].innerHTML = ''; });
  }

  /* Odtwarza zestaw sprite'ów z zapisu (bez animacji wejścia). */
  przywrocSprites(mapa) {
    this.wyczyscSprites();
    for (const postac in mapa) {
      const { pozycja, emocja } = mapa[postac];
      this.pokazSprite(postac, pozycja, emocja);
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

    for (const segment of linia.segmenty) {
      if (segment.typ === 'tekst') {
        pelnyTekst += await this.wpiszTekst(segment.tekst, ctx);
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
