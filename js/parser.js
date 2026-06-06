/* =========================================================================
   parser.js — rdzeń interpretera mini-języka scenariusza
   --------------------------------------------------------------------------
   Po migracji (Faza 0) rdzeń zajmuje się tylko STRUKTURĄ skryptu:
     - dialog / narracja (say) i wymuszona narracja "|"
     - etykiety "== nazwa =="
     - blok wyboru "@choice" + następujące po nim opcje "- ..."
   Parsowanie wszystkich pozostałych @-komend jest delegowane do REJESTRU
   (core/registry.js), więc dodanie nowej komendy nie wymaga ruszania rdzenia.

   Zwraca: { instructions, labels, characters }.
   ========================================================================= */

import { podzielNaSegmenty, parsujWarunek, parsujAtrybuty } from './core/parser-utils.js';

export function parsujSkrypt(zrodlo, rejestr) {
  const linie = zrodlo.split(/\r?\n/);
  const instructions = [];
  const labels = {};
  const characters = {};

  // Kontekst przekazywany do parserów komend (np. @char mutuje characters).
  const kontekst = { instructions, labels, characters, parsujWarunek, parsujAtrybuty };

  // Bufor na trwającą definicję @choice (opcje czytane z kolejnych linii "- ...")
  let biezacyWybor = null;

  for (let nr = 0; nr < linie.length; nr++) {
    const surowa = linie[nr];
    const linia = surowa.trim();

    // Opcje wyboru: linie zaczynające się od "-" w obrębie bloku @choice
    if (biezacyWybor && linia.startsWith('-')) {
      let tresc = linia.slice(1).trim();
      let warunek = null;
      const mIf = tresc.match(/\[if\s+(.+?)\]/);
      if (mIf) {
        warunek = parsujWarunek(mIf[1]);
        tresc = tresc.replace(mIf[0], '').trim();
      }
      const strzalka = tresc.lastIndexOf('->');
      if (strzalka === -1) {
        throw new Error(`Linia ${nr + 1}: opcja wyboru bez "-> etykieta": ${linia}`);
      }
      biezacyWybor.opcje.push({
        tekst: tresc.slice(0, strzalka).trim(),
        cel: tresc.slice(strzalka + 2).trim(),
        warunek,
      });
      continue;
    } else if (biezacyWybor) {
      biezacyWybor = null; // koniec bloku wyboru (linia nie jest opcją)
    }

    // Puste linie i komentarze pomijamy
    if (linia === '' || linia.startsWith('#')) continue;

    // Etykieta:  == nazwa ==
    const mLabel = linia.match(/^==\s*(.+?)\s*==$/);
    if (mLabel) {
      labels[mLabel[1]] = instructions.length;
      instructions.push({ typ: 'label', nazwa: mLabel[1] });
      continue;
    }

    // @-komenda — delegacja do rejestru
    if (linia.startsWith('@')) {
      const spacja = linia.indexOf(' ');
      const komenda = (spacja === -1 ? linia : linia.slice(0, spacja)).slice(1);
      const reszta = spacja === -1 ? '' : linia.slice(spacja + 1).trim();
      const slowa = reszta.length ? reszta.split(/\s+/) : [];

      let instr;
      try {
        instr = rejestr.parsujKomende(komenda, reszta, slowa, kontekst);
      } catch (e) {
        throw new Error(`Linia ${nr + 1}: ${e.message}`);
      }
      if (instr) {
        instructions.push(instr);
        // Blok wyboru: kolejne linie "- ..." doklejają się do tego obiektu.
        if (instr.typ === 'choice') biezacyWybor = instr;
      }
      continue;
    }

    // ---- Treść: dialog albo narracja ----

    // Wymuszona narracja znakiem | na początku
    if (linia.startsWith('|')) {
      const tekst = linia.slice(1).trimStart();
      instructions.push({ typ: 'say', mowiacy: null, kolor: null, segmenty: podzielNaSegmenty(tekst) });
      continue;
    }

    // Dialog TYLKO gdy "Imię:" i Imię jest w manifeście postaci.
    const mDialog = surowa.match(/^([^:]+):\s?([\s\S]*)$/);
    if (mDialog && characters[mDialog[1].trim()]) {
      const postac = characters[mDialog[1].trim()];
      instructions.push({
        typ: 'say',
        mowiacy: postac.imie,
        kolor: postac.kolor,
        segmenty: podzielNaSegmenty(mDialog[2]),
      });
      continue;
    }

    // Wszystko inne (z dwukropkiem czy bez) to narracja.
    instructions.push({ typ: 'say', mowiacy: null, kolor: null, segmenty: podzielNaSegmenty(linia) });
  }

  return { instructions, labels, characters };
}
