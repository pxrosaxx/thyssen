# Silnik Visual Novel (vanilla JS, moduły ES6)

Lokalny silnik visual novel napisany w czystym HTML/CSS/JavaScript (moduły ES6,
bez frameworków). **Treść jest twardo oddzielona od silnika** — fabułę piszesz
w jednym pliku tekstowym `story/opowiesc.txt`, a silnik tylko go wczytuje i
interpretuje. Aby dopisać scenę, edytujesz wyłącznie ten plik; kodu nie ruszasz.

---

## Uruchomienie

Projekt korzysta z `fetch` i modułów ES6, więc **musi być uruchamiany przez
lokalny serwer** (nie przez podwójne kliknięcie w `index.html` — przeglądarka
zablokowałaby wczytywanie plików przez CORS).

W katalogu projektu uruchom:

```
python -m http.server
```

a następnie otwórz w przeglądarce: <http://localhost:8000>

---

## Struktura projektu

```
.
├── index.html              # punkt wejścia, kontener sceny 16:9
├── README.md               # ten plik
├── css/
│   └── style.css           # layout 16:9, okno dialogowe, menu, przejścia fade
├── js/
│   ├── main.js             # bootstrap: wczytanie fabuły fetchem, spięcie UI
│   ├── parser.js           # interpreter mini-języka scenariusza (.txt)
│   ├── engine.js           # maszyna stanów: flagi, zmienne, branching, audio
│   ├── presentation.js     # render: tła, sprite'y, typewriter, wybory, fade
│   ├── audio.js            # menedżer audio (kanały BGM i SFX)
│   ├── save.js             # save/load wielosłotowy (localStorage)
│   ├── history.js          # log / historia dialogów
│   └── settings.js         # ustawienia (prędkość tekstu, głośności)
├── story/
│   └── opowiesc.txt        # FABUŁA — tutaj piszesz sceny
└── assets/
    ├── bg/                 # tła (opcjonalne; bez nich działają placeholdery)
    ├── sprites/            # postacie (opcjonalne)
    └── audio/
        ├── bgm/            # muzyka w tle (np. cisza.mp3)
        └── sfx/            # efekty (np. dzwon.mp3)
```

> Grafiki i dźwięki są opcjonalne. Bez nich silnik rysuje kolorowe placeholdery
> z etykietami, a dźwięki po prostu milczą — wszystko działa od razu.

---

## Składnia skryptu fabuły

Zasada ogólna: **jedna linia = jedna instrukcja**. Puste linie oraz linie
zaczynające się od `#` (komentarze) są ignorowane. Wszystkie operatory są w
czystym ASCII (`>=`, `<=`, `!=`, `->`). Plik zapisuj w kodowaniu **UTF-8**.

### Manifest postaci

Na górze pliku deklarujesz, kto może mówić. To **zamknięty zbiór mówiących** —
dzięki temu narracja z dwukropkiem (np. „Zostały trzy rzeczy: chleb, sól") nie
zostanie błędnie wzięta za dialog.

```
@char Halszka color=#c9a86a sprite=halszka
@char Wojt    color=#9a3b30 sprite=wojt
```

- `color` — kolor imienia w oknie dialogowym
- `sprite` — domyślny klucz sprite'a postaci
- Imię z spacją ujmij w cudzysłów: `@char "Stary Rycerz" color=#888 sprite=rycerz`

Opcjonalne parametry animacji (rozsądne wartości domyślne, gdy pominięte):

```
@char Wojt color=#9a3b30 sprite=wojt \
      oddech=on oddech_amp=1.4 oddech_tempo=3.0 \
      flap=on flap_tempo=175 \
      usta_otwarte=assets/sprites/wojt_usta_o.png \
      usta_zamkniete=assets/sprites/wojt_usta_z.png
```

- `oddech` — `on` (domyślnie) / `off`: subtelny, zapętlony ruch idle
- `oddech_amp` — amplituda unoszenia w jednostkach `cqh` (domyślnie `1.0`)
- `oddech_tempo` — okres jednego oddechu w sekundach (domyślnie `3.6`)
- `flap` — `on` (domyślnie) / `off`: ruch ust podczas mówienia
- `flap_tempo` — czas jednej klatki ust w ms (domyślnie `175`)
- `usta_otwarte` / `usta_zamkniete` — ścieżki do wariantów grafik ust

(Powyższy zapis pokazano z `\` dla czytelności — w pliku fabuły **cały `@char`
musi być w jednej linii**.)

### Dialog i narracja

```
Halszka: Wiem, że nie śpisz.        # dialog — bo "Halszka" jest w manifeście
Noc weszła do izby razem z mrozem.  # narracja — imię spoza manifestu
| Zostały trzy rzeczy: chleb, sól.  # wymuszona narracja (rzadki wyjątek)
```

`Imię:` uruchamia dialog **tylko** jeśli `Imię` jest w manifeście. Każda inna
linia (z dwukropkiem czy bez) to narracja. Znak `|` na początku wymusza
narrację, gdyby kiedyś realne imię kolidowało z początkiem zdania.

### Pauzy (budowanie napięcia)

Pauzy wstawiasz **wewnątrz** linii tekstu, by sterować rytmem jednej wypowiedzi:

```
Halszka: Wiem, co zrobiłeś.{w} I wiem dlaczego.{w=2} Ale to nic nie zmienia.
```

- `{w}` — zatrzymaj i czekaj na **kliknięcie**, po czym kontynuuj **tę samą
  linię** (cisza, ciężar)
- `{w=1.5}` — odczekaj 1,5 sekundy i sam dopisz dalej

### Tło

```
@bg izba_noc fade      # zmiana tła z przejściem fade (domyślnie)
@bg dziedziniec cut    # natychmiastowa zmiana, bez przejścia
```

### Postacie (sprite'y)

```
@show Halszka center zmeczona   # pokaż: postać, pozycja, emocja
@show Wojt left ponury          # pozycje: left / center / right
@hide Wojt                      # ukryj postać (z fade-out)
```

### Animacja postaci

Każdy widoczny sprite **automatycznie oddycha** (idle) i **rusza ustami tylko
podczas wypisywania swojej kwestii** (flap spięty z maszyną do pisania —
usta zamykają się natychmiast przy pauzie `{w}`/`{w=N}`, na końcu linii i gdy
gra czeka na kliknięcie). Domyślne zachowanie konfigurujesz w manifeście
(`@char`, sekcja wyżej). Nic nie musisz robić w treści scen.

Opcjonalnie możesz **chwilowo nadpisać** animację postaci ze skryptu, by zagrać
dramaturgią (np. panika vs. martwa cisza):

```
@anim Wojt oddech szybki     # przyspiesz oddech (panika)
@anim Wojt oddech spokojny   # zwolnij oddech (ukojenie)
@anim Wojt oddech stop       # zatrzymaj oddech (postać zamiera)
@anim Wojt oddech start      # wznów oddech (alias: wznow)
@anim Wojt oddech normalny   # powrót do tempa z manifestu
@anim Wojt oddech 2.0        # własny okres oddechu w sekundach
```

Nadpisania są zapamiętywane w zapisie stanu (po wczytaniu postać oddycha tak
jak przed zapisem). Ponowne `@show` tej postaci resetuje nadpisania do
ustawień z manifestu.

> **Ruch ust a grafiki:** na placeholderach (bez assetów) flap jest widoczny
> jako otwierające się usta rysowane przez CSS, więc można go przetestować od
> razu. Przy prawdziwych grafikach flap podmienia warianty `usta_otwarte` /
> `usta_zamkniete`; brak tych wariantów dla grafiki = postać nie rusza ustami
> (nadal oddycha). Flap można też wyłączyć per postać: `flap=off`.

### Audio

```
@bgm cisza loop    # zapętlona muzyka w tle
@bgm stop          # zatrzymanie muzyki
@sfx dzwon         # jednorazowy efekt dźwiękowy
```

Pliki: `assets/audio/bgm/cisza.mp3`, `assets/audio/sfx/dzwon.mp3` (opcjonalne).

### Pauza między liniami

```
@wait 2            # cała scena czeka 2 sekundy
```

### Etykiety i skoki

```
== start ==        # etykieta / sekcja
@jump rankiem      # skok bezwarunkowy do etykiety
@end Razem         # zakończenie (nazwa pojawia się na ekranie końca)
```

### Flagi i zmienne

```
@set $zaufanie = 0     # ustaw zmienną liczbową
@set $zaufanie += 1    # operatory: =  +=  -=  *=  /=
@flag klamstwo         # ustaw flagę
@unflag klamstwo       # zdejmij flagę
```

### Skoki warunkowe

```
@if $zaufanie >= 1 -> koniec_dobry   # warunek na zmiennej
@if klamstwo -> koniec_zly           # warunek na fladze (ustawiona)
@if !klamstwo -> koniec_dobry        # flaga NIE ustawiona
```

Operatory porównań: `==  !=  >  <  >=  <=`.

### Wybory gracza

```
@choice
  - Skłamać, że ziarno spłonęło -> sciezka_klamstwo
  - Powiedzieć prawdę -> sciezka_prawda
```

Każda opcja: `tekst -> etykieta`. Opcję można warunkowo ukryć:

```
@choice
  - Zaufaj mu [if $zaufanie >= 2] -> sojusz
  - Oskarż go -> proces
```

---

## Jak dopisać scenę

1. Otwórz `story/opowiesc.txt` (zapisuj jako **UTF-8**).
2. (Opcjonalnie) dodaj nowych mówiących do manifestu `@char` na górze pliku.
3. Dodaj nową sekcję z etykietą, np. `== las ==`, i pod nią treść oraz komendy.
4. Połącz ją z resztą fabuły skokiem (`@jump las`) lub opcją wyboru
   (`- Idź do lasu -> las`).
5. Odśwież stronę w przeglądarce. **Kodu nie modyfikujesz.**

---

## Funkcje (Quality of Life)

- **Save/Load** — wiele slotów w `localStorage`. Zapis obejmuje pełny stan:
  pozycję w skrypcie, wszystkie zmienne i flagi, aktualne tło, aktywne sprite'y
  z pozycjami i nadpisaniami animacji (`@anim`), aktualną muzykę, log historii
  oraz ostatnio wyświetlaną linię.
  Po wczytaniu ekran wygląda dokładnie tak jak przed zapisem.
- **Log / historia** — przewijalna lista wszystkich wypowiedzi.
- **Auto** — automatyczne przewijanie dialogów.
- **Skip** — szybkie pomijanie.
- **Ustawienia** — prędkość tekstu oraz osobne suwaki głośności BGM i SFX
  (przechowywane osobno od zapisów stanu, pod kluczem `vn_settings`).

### Sterowanie

- **Klik / spacja / enter** — dalej (lub dokończ wpisywanie linii)
- **Esc** — zamknij otwartą nakładkę
- Pasek narzędzi w prawym górnym rogu: AUTO, SKIP, LOG, ZAPIS, WCZYTAJ, USTAW.

---

## Uwagi techniczne

- Cały interfejs, komentarze w kodzie i dokumentacja są po polsku.
- Scena utrzymuje proporcje **16:9** i skaluje się proporcjonalnie (PC i telefon)
  dzięki jednostkom container query (`cqw`/`cqh`) — tekst skaluje się razem ze
  sceną.
- Kodowanie **UTF-8** jest spójne na całej drodze: plik `.txt` → `fetch` →
  `<meta charset="utf-8">`, więc polskie znaki nie rozsypią się.
