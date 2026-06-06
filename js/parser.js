/* =========================================================================
   parser.js — interpreter mini-języka scenariusza
   --------------------------------------------------------------------------
   Zamienia surowy tekst pliku fabuły (.txt, UTF-8) na:
     - instructions: płaską listę instrukcji dla maszyny stanów
     - labels:       mapę "nazwa etykiety" -> indeks w instructions
     - characters:   manifest postaci (kolor imienia, domyślny sprite)

   Cała składnia jest w czystym ASCII dla operatorów (>=, <=, !=, ->).
   Polskie znaki w treści dialogów są obsługiwane przez UTF-8.
   ========================================================================= */

/* Dzieli tekst dialogu/narracji na segmenty, wyłuskując pauzy inline:
     {w}     -> pauza na kliknięcie (kontynuuje TĘ SAMĄ linię)
     {w=1.5} -> pauza czasowa 1,5 s
   Zwraca listę: {typ:'tekst', tekst} | {typ:'klik'} | {typ:'czas', sekundy}  */
function podzielNaSegmenty(tekst) {
  const segmenty = [];
  const re = /\{w(?:=([0-9]*\.?[0-9]+))?\}/g;
  let ostatni = 0;
  let m;
  while ((m = re.exec(tekst)) !== null) {
    if (m.index > ostatni) {
      segmenty.push({ typ: 'tekst', tekst: tekst.slice(ostatni, m.index) });
    }
    if (m[1] !== undefined) {
      segmenty.push({ typ: 'czas', sekundy: parseFloat(m[1]) });
    } else {
      segmenty.push({ typ: 'klik' });
    }
    ostatni = re.lastIndex;
  }
  if (ostatni < tekst.length) {
    segmenty.push({ typ: 'tekst', tekst: tekst.slice(ostatni) });
  }
  if (segmenty.length === 0) segmenty.push({ typ: 'tekst', tekst: '' });
  return segmenty;
}

/* Parsuje warunek, np. "$relacja >= 3", "zdradzony", "!zdradzony".
   Zwraca obiekt opisujący warunek do oceny przez silnik.            */
function parsujWarunek(tekst) {
  tekst = tekst.trim();
  // warunek na zmiennej liczbowej: $nazwa OP wartosc
  const mZmienna = tekst.match(/^\$([A-Za-z_][\w]*)\s*(==|!=|>=|<=|>|<)\s*(-?[0-9]*\.?[0-9]+)$/);
  if (mZmienna) {
    return { rodzaj: 'zmienna', nazwa: mZmienna[1], operator: mZmienna[2], wartosc: parseFloat(mZmienna[3]) };
  }
  // warunek na fladze: !nazwa lub nazwa
  if (tekst.startsWith('!')) {
    return { rodzaj: 'flaga', nazwa: tekst.slice(1).trim(), negacja: true };
  }
  return { rodzaj: 'flaga', nazwa: tekst, negacja: false };
}

/* Rozbija string typu 'klucz=wartosc klucz2="wartosc z spacja"' na obiekt. */
function parsujAtrybuty(reszta) {
  const atrybuty = {};
  const re = /(\w+)=("([^"]*)"|\S+)/g;
  let m;
  while ((m = re.exec(reszta)) !== null) {
    atrybuty[m[1]] = m[3] !== undefined ? m[3] : m[2];
  }
  return atrybuty;
}

export function parsujSkrypt(zrodlo) {
  const linie = zrodlo.split(/\r?\n/);
  const instructions = [];
  const labels = {};
  const characters = {};

  // Bufor na trwającą definicję @choice (opcje czytane z kolejnych linii "- ...")
  let biezacyWybor = null;

  function zakonczWybor() {
    if (biezacyWybor) {
      instructions.push(biezacyWybor);
      biezacyWybor = null;
    }
  }

  for (let nr = 0; nr < linie.length; nr++) {
    const surowa = linie[nr];
    const linia = surowa.trim();

    // Opcje wyboru: linie zaczynające się od "-" w obrębie bloku @choice
    if (biezacyWybor && linia.startsWith('-')) {
      let tresc = linia.slice(1).trim();
      // opcjonalny warunek widoczności: [if ...]
      let warunek = null;
      const mIf = tresc.match(/\[if\s+(.+?)\]/);
      if (mIf) {
        warunek = parsujWarunek(mIf[1]);
        tresc = tresc.replace(mIf[0], '').trim();
      }
      // tekst -> etykieta
      const strzalka = tresc.lastIndexOf('->');
      if (strzalka === -1) {
        throw new Error(`Linia ${nr + 1}: opcja wyboru bez "-> etykieta": ${linia}`);
      }
      const tekstOpcji = tresc.slice(0, strzalka).trim();
      const cel = tresc.slice(strzalka + 2).trim();
      biezacyWybor.opcje.push({ tekst: tekstOpcji, cel, warunek });
      continue;
    } else if (biezacyWybor) {
      // koniec bloku wyboru (linia nie jest opcją)
      zakonczWybor();
    }

    // Puste linie i komentarze pomijamy
    if (linia === '' || linia.startsWith('#')) continue;

    // ---- Komendy silnika (zaczynają się od @ albo ==) ----

    // Etykieta:  == nazwa ==
    const mLabel = linia.match(/^==\s*(.+?)\s*==$/);
    if (mLabel) {
      labels[mLabel[1]] = instructions.length;
      instructions.push({ typ: 'label', nazwa: mLabel[1] });
      continue;
    }

    if (linia.startsWith('@')) {
      const spacja = linia.indexOf(' ');
      const komenda = (spacja === -1 ? linia : linia.slice(0, spacja)).slice(1);
      const reszta = spacja === -1 ? '' : linia.slice(spacja + 1).trim();
      const slowa = reszta.length ? reszta.split(/\s+/) : [];

      switch (komenda) {
        case 'char': {
          // @char Imię color=#hex sprite=klucz   (Imię może być w cudzysłowie)
          const mNazwa = reszta.match(/^"([^"]+)"|^(\S+)/);
          const imie = mNazwa[1] || mNazwa[2];
          const atrybuty = parsujAtrybuty(reszta);
          characters[imie] = {
            imie,
            kolor: atrybuty.color || '#e8e2d6',
            sprite: atrybuty.sprite || null,
          };
          break;
        }
        case 'bg': {
          instructions.push({ typ: 'bg', nazwa: slowa[0] || '', przejscie: slowa[1] || 'fade' });
          break;
        }
        case 'show': {
          // @show postac pozycja emocja
          instructions.push({
            typ: 'show',
            postac: slowa[0],
            pozycja: slowa[1] || 'center',
            emocja: slowa[2] || 'neutralny',
          });
          break;
        }
        case 'hide': {
          instructions.push({ typ: 'hide', postac: slowa[0] });
          break;
        }
        case 'bgm': {
          if (slowa[0] === 'stop') instructions.push({ typ: 'bgm', stop: true });
          else instructions.push({ typ: 'bgm', nazwa: slowa[0], loop: true });
          break;
        }
        case 'sfx': {
          instructions.push({ typ: 'sfx', nazwa: slowa[0] });
          break;
        }
        case 'wait': {
          instructions.push({ typ: 'wait', sekundy: parseFloat(slowa[0]) || 0 });
          break;
        }
        case 'jump': {
          instructions.push({ typ: 'jump', cel: slowa[0] });
          break;
        }
        case 'end': {
          instructions.push({ typ: 'end', nazwa: reszta || 'Koniec' });
          break;
        }
        case 'set': {
          // @set $nazwa OP wartosc    OP in: = += -= *= /=
          const m = reszta.match(/^\$([A-Za-z_][\w]*)\s*(=|\+=|-=|\*=|\/=)\s*(-?[0-9]*\.?[0-9]+)$/);
          if (!m) throw new Error(`Linia ${nr + 1}: błędny @set: ${linia}`);
          instructions.push({ typ: 'set', nazwa: m[1], operator: m[2], wartosc: parseFloat(m[3]) });
          break;
        }
        case 'flag': {
          instructions.push({ typ: 'flag', nazwa: slowa[0], wartosc: true });
          break;
        }
        case 'unflag': {
          instructions.push({ typ: 'flag', nazwa: slowa[0], wartosc: false });
          break;
        }
        case 'if': {
          // @if warunek -> etykieta
          const strzalka = reszta.lastIndexOf('->');
          if (strzalka === -1) throw new Error(`Linia ${nr + 1}: @if bez "-> etykieta": ${linia}`);
          const warunek = parsujWarunek(reszta.slice(0, strzalka));
          const cel = reszta.slice(strzalka + 2).trim();
          instructions.push({ typ: 'if', warunek, cel });
          break;
        }
        case 'choice': {
          biezacyWybor = { typ: 'choice', opcje: [] };
          break;
        }
        default:
          throw new Error(`Linia ${nr + 1}: nieznana komenda @${komenda}`);
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

  zakonczWybor();

  return { instructions, labels, characters };
}
