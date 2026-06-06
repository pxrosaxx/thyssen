/* =========================================================================
   commands/builtins.js — wbudowane komendy skryptu (Faza 0)
   --------------------------------------------------------------------------
   Migracja dotychczasowych @-komend (i instrukcji strukturalnych say/label/
   choice) na rejestr komend. Zachowanie jest IDENTYCZNE jak przed migracją —
   to czysta zmiana architektoniczna. Każda definicja dostarcza:
     - parsuj(komenda, reszta, slowa, kontekst) -> instrukcja | null
     - wykonaj(instr, silnik) -> bool (true wstrzymuje pętlę)
   Dodatkowo wykonawcy emitują zdarzenia na magistrali (Filar A); domyślnie
   nikt krytyczny ich nie słucha, więc rozgrywka pozostaje bez zmian.
   ========================================================================= */

import { predkoscNaOpoznienie } from '../settings.js';
import { parsujWarunek, parsujAtrybuty } from '../core/parser-utils.js';

export function zarejestrujWbudowane(rejestr) {

  /* --- Tło ----------------------------------------------------------- */
  rejestr.zarejestruj({
    komendy: ['bg'], typy: ['bg'],
    parsuj: (k, reszta, slowa) => ({ typ: 'bg', nazwa: slowa[0] || '', przejscie: slowa[1] || 'fade' }),
    wykonaj: async (instr, s) => {
      s.tlo = instr.nazwa;
      await s.present.ustawTlo(instr.nazwa, s.trybSkip ? 'cut' : instr.przejscie);
      s.bus.emit('onBgChange', instr.nazwa);
      return false;
    },
  });

  /* --- Sprite: pokaż / ukryj ----------------------------------------- */
  rejestr.zarejestruj({
    komendy: ['show'], typy: ['show'],
    parsuj: (k, reszta, slowa) => ({
      typ: 'show', postac: slowa[0], pozycja: slowa[1] || 'center', emocja: slowa[2] || 'neutralny',
    }),
    wykonaj: (instr, s) => {
      s.sprites[instr.postac] = { pozycja: instr.pozycja, emocja: instr.emocja };
      s.present.pokazSprite(instr.postac, instr.pozycja, instr.emocja);
      return false;
    },
  });

  rejestr.zarejestruj({
    komendy: ['hide'], typy: ['hide'],
    parsuj: (k, reszta, slowa) => ({ typ: 'hide', postac: slowa[0] }),
    wykonaj: (instr, s) => {
      delete s.sprites[instr.postac];
      s.present.ukryjSprite(instr.postac);
      return false;
    },
  });

  /* --- Audio --------------------------------------------------------- */
  rejestr.zarejestruj({
    komendy: ['bgm'], typy: ['bgm'],
    parsuj: (k, reszta, slowa) =>
      slowa[0] === 'stop' ? { typ: 'bgm', stop: true } : { typ: 'bgm', nazwa: slowa[0], loop: true },
    wykonaj: (instr, s) => {
      if (instr.stop) s.audio.stopBgm();
      else s.audio.graBgm(instr.nazwa);
      return false;
    },
  });

  rejestr.zarejestruj({
    komendy: ['sfx'], typy: ['sfx'],
    parsuj: (k, reszta, slowa) => ({ typ: 'sfx', nazwa: slowa[0] }),
    wykonaj: (instr, s) => {
      if (!s.trybSkip) s.audio.graSfx(instr.nazwa);
      return false;
    },
  });

  /* --- Pauza między liniami ------------------------------------------ */
  rejestr.zarejestruj({
    komendy: ['wait'], typy: ['wait'],
    parsuj: (k, reszta, slowa) => ({ typ: 'wait', sekundy: parseFloat(slowa[0]) || 0 }),
    wykonaj: async (instr, s) => {
      if (!s.trybSkip) await s.sleepLubKlik(instr.sekundy * 1000);
      return false;
    },
  });

  /* --- Skoki / etykiety / zakończenia -------------------------------- */
  rejestr.zarejestruj({
    komendy: ['jump'], typy: ['jump'],
    parsuj: (k, reszta, slowa) => ({ typ: 'jump', cel: slowa[0] }),
    wykonaj: (instr, s) => { s.skoczDo(instr.cel); return false; },
  });

  // 'label' nie ma własnej @-komendy (powstaje z == nazwa ==), ale ma wykonawcę.
  rejestr.zarejestruj({
    typy: ['label'],
    wykonaj: (instr, s) => { s.etykieta = instr.nazwa; s.bus.emit('onLabel', instr.nazwa); return false; },
  });

  rejestr.zarejestruj({
    komendy: ['end'], typy: ['end'],
    parsuj: (k, reszta) => ({ typ: 'end', nazwa: reszta || 'Koniec' }),
    wykonaj: (instr, s) => { s.dziala = false; s.bus.emit('onEnd', instr.nazwa); s.naKoniec?.(instr.nazwa); return true; },
  });

  /* --- Stan: zmienne i flagi ----------------------------------------- */
  rejestr.zarejestruj({
    komendy: ['set'], typy: ['set'],
    parsuj: (k, reszta) => {
      const m = reszta.match(/^\$([A-Za-z_][\w]*)\s*(=|\+=|-=|\*=|\/=)\s*(-?[0-9]*\.?[0-9]+)$/);
      if (!m) throw new Error(`błędny @set: ${reszta}`);
      return { typ: 'set', nazwa: m[1], operator: m[2], wartosc: parseFloat(m[3]) };
    },
    wykonaj: (instr, s) => {
      const stara = s.zmienne[instr.nazwa] || 0;
      s.zastosujSet(instr);
      s.bus.emit('onStateChange', { klucz: '$' + instr.nazwa, stara, nowa: s.zmienne[instr.nazwa] });
      return false;
    },
  });

  rejestr.zarejestruj({
    komendy: ['flag', 'unflag'], typy: ['flag'],
    parsuj: (k, reszta, slowa) => ({ typ: 'flag', nazwa: slowa[0], wartosc: k === 'flag' }),
    wykonaj: (instr, s) => {
      const stara = !!s.flagi[instr.nazwa];
      s.flagi[instr.nazwa] = instr.wartosc;
      s.bus.emit('onStateChange', { klucz: instr.nazwa, stara, nowa: instr.wartosc });
      return false;
    },
  });

  /* --- Skok warunkowy ------------------------------------------------ */
  rejestr.zarejestruj({
    komendy: ['if'], typy: ['if'],
    parsuj: (k, reszta) => {
      const strzalka = reszta.lastIndexOf('->');
      if (strzalka === -1) throw new Error(`@if bez "-> etykieta": ${reszta}`);
      return { typ: 'if', warunek: parsujWarunek(reszta.slice(0, strzalka)), cel: reszta.slice(strzalka + 2).trim() };
    },
    wykonaj: (instr, s) => { if (s.ocenWarunek(instr.warunek)) s.skoczDo(instr.cel); return false; },
  });

  /* --- Animacja postaci ---------------------------------------------- */
  rejestr.zarejestruj({
    komendy: ['anim'], typy: ['anim'],
    parsuj: (k, reszta, slowa) => ({ typ: 'anim', postac: slowa[0], wlasciwosc: slowa[1], wartosc: slowa[2] }),
    wykonaj: (instr, s) => { s.zastosujAnim(instr); return false; },
  });

  /* --- Manifest postaci (mutuje kontekst, brak instrukcji) ----------- */
  rejestr.zarejestruj({
    komendy: ['char'],
    parsuj: (k, reszta, slowa, kontekst) => {
      const mNazwa = reszta.match(/^"([^"]+)"|^(\S+)/);
      const imie = mNazwa[1] || mNazwa[2];
      const a = parsujAtrybuty(reszta);
      const liczbaLub = (v, dom) => (v !== undefined && !isNaN(parseFloat(v)) ? parseFloat(v) : dom);
      kontekst.characters[imie] = {
        imie,
        kolor: a.color || '#e8e2d6',
        sprite: a.sprite || null,
        oddech: a.oddech !== 'off',
        oddechAmp: liczbaLub(a.oddech_amp, 1.0),
        oddechTempo: liczbaLub(a.oddech_tempo, 3.6),
        flap: a.flap !== 'off',
        flapTempo: liczbaLub(a.flap_tempo, 175),
        ustaOtwarte: a.usta_otwarte || null,
        ustaZamkniete: a.usta_zamkniete || null,
      };
      return null; // brak instrukcji do listy
    },
  });

  /* --- Wybór (blok wieloliniowy: linia @choice + następujące "- ...") - */
  rejestr.zarejestruj({
    komendy: ['choice'], typy: ['choice'],
    parsuj: () => ({ typ: 'choice', opcje: [] }), // opcje dokleja rdzeń parsera
    wykonaj: (instr, s) => { s.pokazWybory(instr.opcje); return true; },
  });

  /* --- Dialog / narracja (instrukcja strukturalna 'say') ------------- */
  rejestr.zarejestruj({
    typy: ['say'],
    wykonaj: async (instr, s) => {
      const ctx = {
        opoznienie: predkoscNaOpoznienie(s.ustawienia.predkoscTekstu),
        trybSkip: s.trybSkip,
        sleepLubKlik: (ms) => s.sleepLubKlik(ms),
        czekajNaKlik: () => s.czekajNaKlik(),
      };
      const tekst = await s.present.wyswietlLinie(instr, ctx);
      s.widok = { mowiacy: instr.mowiacy, kolor: instr.kolor, tekst };
      s.historia.dodaj(instr.mowiacy, tekst);
      s.bus.emit('onLineShown', { mowiacy: instr.mowiacy, tekst, indeks: s.aktualnyIndeks });
      await s.czekajNaPostep();
      return false;
    },
  });
}
