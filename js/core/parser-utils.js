/* =========================================================================
   core/parser-utils.js — pomocniki parsera współdzielone przez rdzeń i komendy
   --------------------------------------------------------------------------
   Wydzielone z parser.js, by moduły komend (commands/*) mogły korzystać z
   tych samych funkcji parsujących, co rdzeń. Operatory są w czystym ASCII.
   ========================================================================= */

/* Dzieli tekst dialogu/narracji na segmenty, wyłuskując pauzy inline:
     {w}     -> pauza na kliknięcie (kontynuuje TĘ SAMĄ linię)
     {w=1.5} -> pauza czasowa 1,5 s
   Zwraca listę: {typ:'tekst', tekst} | {typ:'klik'} | {typ:'czas', sekundy}  */
export function podzielNaSegmenty(tekst) {
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
export function parsujWarunek(tekst) {
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
export function parsujAtrybuty(reszta) {
  const atrybuty = {};
  const re = /(\w+)=("([^"]*)"|\S+)/g;
  let m;
  while ((m = re.exec(reszta)) !== null) {
    atrybuty[m[1]] = m[3] !== undefined ? m[3] : m[2];
  }
  return atrybuty;
}
