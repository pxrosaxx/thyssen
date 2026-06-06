/* =========================================================================
   modules/przyklad-wtyczka.js — moduł-próbka (dowód wtyczkowości, Faza 0)
   --------------------------------------------------------------------------
   Pokazuje, że nowy system wpina się w rdzeń BEZ jego modyfikacji:
     1) rejestruje własną komendę skryptu (@echo "tekst") przez rejestr,
     2) nasłuchuje zdarzeń silnika na magistrali (bus).

   Moduł jest celowo NIEINWAZYJNY: niczego nie zmienia w rozgrywce, tylko
   pisze do konsoli przeglądarki (DevTools). Dzięki temu Faza 0 zachowuje
   identyczne zachowanie gry, a jednocześnie potwierdza działanie obu filarów.
   Aby go wyłączyć, wystarczy nie dołączać go w main.js.
   ========================================================================= */

export default {
  nazwa: 'przyklad-wtyczka',

  /* Instalacja: dostaje rejestr komend i magistralę zdarzeń. */
  zainstaluj({ rejestr, bus }) {
    // (1) Nowa komenda skryptu — opcjonalna, nieużywana w fabule.
    //     Składnia: @echo dowolny tekst   (wypisuje do konsoli)
    rejestr.zarejestruj({
      komendy: ['echo'], typy: ['echo'],
      parsuj: (komenda, reszta) => ({ typ: 'echo', tekst: reszta }),
      wykonaj: (instr) => { console.log('[echo]', instr.tekst); return false; },
    });

    // (2) Nasłuch zdarzeń cyklu życia — czysta obserwacja.
    bus.on('onStart',       ()      => console.log('[wtyczka] nowa gra'));
    bus.on('onLabel',       (n)     => console.log('[wtyczka] etykieta:', n));
    bus.on('onLineShown',   (d)     => console.log('[wtyczka] linia:', d.mowiacy || '(narracja)', '#' + d.indeks));
    bus.on('onChoiceShown', (o)     => console.log('[wtyczka] wybór:', o.length, 'opcji'));
    bus.on('onChoiceMade',  (o)     => console.log('[wtyczka] wybrano:', o.tekst));
    bus.on('onStateChange', (d)     => console.log('[wtyczka] stan:', d.klucz, d.stara, '->', d.nowa));
    bus.on('onBgChange',    (n)     => console.log('[wtyczka] tło:', n));
    bus.on('onEnd',         (n)     => console.log('[wtyczka] zakończenie:', n));

    console.log('[wtyczka] zainstalowano moduł-próbkę (Faza 0)');
  },
};
