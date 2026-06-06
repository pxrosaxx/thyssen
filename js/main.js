/* =========================================================================
   main.js — bootstrap i spięcie interfejsu
   --------------------------------------------------------------------------
   - wczytuje fabułę z pliku .txt przez fetch (UTF-8)
   - tworzy silnik, prezentację, audio, historię
   - obsługuje menu główne, pasek narzędzi i nakładki (log/sloty/ustawienia)
   ========================================================================= */

import { parsujSkrypt } from './parser.js';
import { Prezentacja } from './presentation.js';
import { MenedzerAudio } from './audio.js';
import { Historia } from './history.js';
import { Silnik } from './engine.js';
import { wczytajUstawienia, zapiszUstawienia } from './settings.js';
import { zapiszStan, wczytajStan, listaSlotow } from './save.js';

const SCIEZKA_FABULY = 'story/opowiesc.txt';

let silnik = null;
let prezentacja = null;
let audio = null;
let historia = null;
let ustawienia = null;
let skrypt = null;

/* Skróty do elementów DOM */
const $ = (id) => document.getElementById(id);
const menuGlowne = $('menu-glowne');
const pasekNarzedzi = $('pasek-narzedzi');
const menuWyborow = $('menu-wyborow');

/* ----------------------------------------------------------------------- */
/* Inicjalizacja                                                           */
/* ----------------------------------------------------------------------- */
async function init() {
  ustawienia = wczytajUstawienia();

  prezentacja = new Prezentacja();
  audio = new MenedzerAudio();
  audio.ustawGlosnoscBgm(ustawienia.glosnoscBgm);
  audio.ustawGlosnoscSfx(ustawienia.glosnoscSfx);
  historia = new Historia();

  // Wczytanie surowego pliku fabuły (UTF-8) i parsowanie
  try {
    const odp = await fetch(SCIEZKA_FABULY);
    if (!odp.ok) throw new Error(`HTTP ${odp.status}`);
    const tekst = await odp.text(); // fetch dekoduje jako UTF-8
    skrypt = parsujSkrypt(tekst);
  } catch (e) {
    alert('Nie udało się wczytać fabuły (' + SCIEZKA_FABULY + ').\n' +
          'Uruchom projekt przez lokalny serwer, np.:  python -m http.server\n\n' +
          'Szczegóły: ' + e.message);
    return;
  }

  silnik = new Silnik({
    skrypt,
    prezentacja,
    audio,
    historia,
    ustawienia,
    naKoniec: pokazKoniec,
    naZmianeStanu: odswiezPrzyciskiTrybow,
  });

  podlaczInterfejs();
  zastosujUstawieniaDoUI();
}

/* ----------------------------------------------------------------------- */
/* Wejście gracza (klik / klawiatura)                                      */
/* ----------------------------------------------------------------------- */
function czyNakladkaOtwarta() {
  return [...document.querySelectorAll('.ekran-nakladka')]
    .some(el => !el.classList.contains('ukryte'));
}

function czyMozliwyPostep() {
  // Postęp fabuły blokujemy, gdy otwarte jest menu, nakładka albo wybory.
  return !czyNakladkaOtwarta() && menuWyborow.classList.contains('ukryte');
}

function podlaczInterfejs() {
  const scena = $('scena');
  scena.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;       // przyciski mają własną obsługę
    if (czyMozliwyPostep()) silnik.naKlik();
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') { zamknijNakladki(); return; }
    if ((e.code === 'Space' || e.code === 'Enter') && czyMozliwyPostep()) {
      e.preventDefault();
      silnik.naKlik();
    }
  });

  // Menu główne
  menuGlowne.addEventListener('click', (e) => {
    const akcja = e.target.dataset.akcja;
    if (akcja === 'nowa-gra') nowaGra();
    else if (akcja === 'wczytaj-z-menu') otworzSloty('wczytaj');
    else if (akcja === 'ustawienia-z-menu') otworzUstawienia();
  });

  // Pasek narzędzi
  pasekNarzedzi.addEventListener('click', (e) => {
    const akcja = e.target.dataset.akcja;
    if (akcja === 'auto') silnik.ustawAuto(!silnik.trybAuto);
    else if (akcja === 'skip') silnik.ustawSkip(!silnik.trybSkip);
    else if (akcja === 'log') otworzLog();
    else if (akcja === 'zapis') otworzSloty('zapis');
    else if (akcja === 'wczytaj') otworzSloty('wczytaj');
    else if (akcja === 'ustawienia') otworzUstawienia();
  });

  // Przyciski zamykania nakładek + powrót do menu
  document.querySelectorAll('[data-akcja="zamknij-nakladke"]').forEach(b =>
    b.addEventListener('click', zamknijNakladki));
  $('nakladka-koniec').addEventListener('click', (e) => {
    if (e.target.dataset.akcja === 'powrot-do-menu') powrotDoMenu();
  });

  // Suwaki ustawień
  $('suwak-predkosc').addEventListener('input', (e) => {
    ustawienia.predkoscTekstu = Number(e.target.value);
    zapiszUstawienia(ustawienia);
  });
  $('suwak-bgm').addEventListener('input', (e) => {
    ustawienia.glosnoscBgm = Number(e.target.value) / 100;
    audio.ustawGlosnoscBgm(ustawienia.glosnoscBgm);
    zapiszUstawienia(ustawienia);
  });
  $('suwak-sfx').addEventListener('input', (e) => {
    ustawienia.glosnoscSfx = Number(e.target.value) / 100;
    audio.ustawGlosnoscSfx(ustawienia.glosnoscSfx);
    zapiszUstawienia(ustawienia);
  });
}

function odswiezPrzyciskiTrybow() {
  pasekNarzedzi.querySelector('[data-akcja="auto"]').classList.toggle('wlaczony', silnik.trybAuto);
  pasekNarzedzi.querySelector('[data-akcja="skip"]').classList.toggle('wlaczony', silnik.trybSkip);
}

/* ----------------------------------------------------------------------- */
/* Sterowanie grą                                                          */
/* ----------------------------------------------------------------------- */
function nowaGra() {
  menuGlowne.classList.add('ukryte');
  pasekNarzedzi.classList.remove('ukryte');
  silnik.start();
}

function powrotDoMenu() {
  silnik.dziala = false;
  silnik.trybAuto = false;
  silnik.trybSkip = false;
  audio.stopBgm();
  zamknijNakladki();
  pasekNarzedzi.classList.add('ukryte');
  prezentacja.pokazOkno(false);
  prezentacja.wyczyscSprites();
  menuGlowne.classList.remove('ukryte');
}

function pokazKoniec(nazwa) {
  $('tekst-konca').textContent = nazwa;
  pasekNarzedzi.classList.add('ukryte');
  $('nakladka-koniec').classList.remove('ukryte');
}

/* ----------------------------------------------------------------------- */
/* Nakładki                                                                */
/* ----------------------------------------------------------------------- */
function zamknijNakladki() {
  ['nakladka-log', 'nakladka-sloty', 'nakladka-ustawienia'].forEach(id =>
    $(id).classList.add('ukryte'));
}

function otworzLog() {
  const cel = $('tresc-log');
  cel.innerHTML = '';
  historia.wpisy.forEach(w => {
    const div = document.createElement('div');
    div.className = 'wpis-log';
    if (w.mowiacy) {
      div.innerHTML = `<span class="kto">${w.mowiacy}:</span> ${escapeHTML(w.tekst)}`;
    } else {
      div.innerHTML = `<em>${escapeHTML(w.tekst)}</em>`;
    }
    cel.appendChild(div);
  });
  $('nakladka-log').classList.remove('ukryte');
  cel.scrollTop = cel.scrollHeight;
}

function otworzUstawienia() {
  zastosujUstawieniaDoUI();
  $('nakladka-ustawienia').classList.remove('ukryte');
}

function zastosujUstawieniaDoUI() {
  $('suwak-predkosc').value = ustawienia.predkoscTekstu;
  $('suwak-bgm').value = Math.round(ustawienia.glosnoscBgm * 100);
  $('suwak-sfx').value = Math.round(ustawienia.glosnoscSfx * 100);
}

/* Tryb: 'zapis' albo 'wczytaj' */
function otworzSloty(tryb) {
  const grawTrakcie = !menuGlowne.classList.contains('ukryte') ? false : true;
  $('tytul-slotow').textContent = tryb === 'zapis' ? 'Zapisz grę' : 'Wczytaj grę';
  const lista = $('lista-slotow');
  lista.innerHTML = '';

  listaSlotow().forEach(({ numer, pusty, meta }) => {
    const div = document.createElement('div');
    div.className = 'slot';
    const opis = document.createElement('div');
    opis.className = 'slot-opis';
    if (pusty) {
      opis.innerHTML = `<span>Slot ${numer}</span><span class="slot-pusty">— pusty —</span>`;
    } else {
      const data = new Date(meta.data).toLocaleString('pl-PL');
      opis.innerHTML = `<span>Slot ${numer}: ${escapeHTML(meta.podglad)}</span>` +
                       `<span class="slot-data">${data}</span>`;
    }
    div.appendChild(opis);

    div.addEventListener('click', () => {
      if (tryb === 'zapis') {
        // Zapis dostępny tylko podczas gry.
        if (!grawTrakcie) return;
        zapiszStan(numer, silnik.doZapisu());
        otworzSloty('zapis'); // odśwież listę
      } else {
        if (pusty) return;
        const stan = wczytajStan(numer);
        if (stan) {
          zamknijNakladki();
          menuGlowne.classList.add('ukryte');
          pasekNarzedzi.classList.remove('ukryte');
          silnik.wczytajZeStanu(stan);
        }
      }
    });

    lista.appendChild(div);
  });

  $('nakladka-sloty').classList.remove('ukryte');
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

init();
