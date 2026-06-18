# Chess Opening Trainer

A self-contained web app for learning and drilling a chess opening repertoire,
tuned for a **1500–1600 chess.com rapid (10|0)** player. Two modes: **Learn**
(walk every line with the *ideas* explained) and **Test** (spaced-repetition
drilling where you play your repertoire moves against the app).

## Run it

The app uses JavaScript modules, so it must be served over HTTP (opening
`index.html` directly with `file://` will not work).

**Easiest:** double-click **`start.command`** in Finder. It starts a local
server and opens the app in your browser.

**Or from a terminal:**

```bash
cd "Chess Study"
python3 -m http.server 8123
# then open http://localhost:8123/index.html
```

Your progress (which lines you've learned and when each is next due) is saved in
your browser's `localStorage`, so use the same browser to keep your history.

## The repertoire

Chosen to minimize rote memorization and maximize understanding of plans and
pawn structures — the things that actually win games on a 10-minute clock.

### White — 1.e4, the Italian complex
| vs | Your system |
|----|-------------|
| 1...e5 | Italian / Giuoco Pianissimo (c3, d3, slow build-up) |
| 1...e5 2...Nf6 | Quiet 4.d3 (skips the Fried Liver) |
| Petroff (2...Nf6) | 3.Nxe5, simple edge |
| Sicilian (1...c5) | Alapin 2.c3 (low theory) |
| French (1...e6) | Advance 3.e5 |
| Caro-Kann (1...c6) | Advance, Short System |
| Scandinavian (1...d5) | 3.Nc3 with fast development |
| Pirc / Modern | Classical center (Be2, O-O) |

### Black vs 1.e4 — Accelerated Dragon
One core idea: the `...d5` freeing break. Includes the Maroczy Bind, Rossolimo,
Alapin, Closed Sicilian and Grand Prix.

### Black vs 1.d4 — Nimzo-Indian / Bogo-Indian
Nimzo (3...Bb4) vs Rubinstein (4.e3), Classical (4.Qc2), Sämisch (4.a3), 4.f3.
Bogo (3...Bb4+) when White plays 3.Nf3. Plus answers to the Catalan, London and
Trompowsky.

## How Test mode scores you

Each line is a flashcard placed in a Leitner box. Drill intervals:

| Box | Next review |
|-----|-------------|
| 1 | today |
| 2 | 1 day |
| 3 | 3 days |
| 4 | 7 days |
| 5 | 16 days |

- Play a line with **no mistakes** → it moves up a box (longer interval).
- A **wrong move** or using **Show move** → back to box 1.
- A **hint** keeps it in place.

## Adding or editing lines

All content lives in [`js/repertoire.js`](js/repertoire.js) as plain data —
complete move sequences with an explanation (`c`) on each move. Lines that share
a prefix are merged automatically, so you only annotate the new moves of a
branch.

After editing, validate that every move is legal:

```bash
python3 -m pip install --user python-chess   # one-time
python3 validate.py
```

## Files

```
index.html        app shell
css/style.css     styling + chessboard
js/repertoire.js  the repertoire data (edit this to change content)
js/board.js       chessboard rendering + click-to-move
js/app.js         Learn/Test logic + spaced-repetition scheduler
lib/chess.js      chess.js (move legality), vendored
img/pieces-kaneo/ chess piece images
validate.py       legality checker for repertoire.js
start.command     double-click launcher
```

## Credits

- Board: standard green/white theme.
- Pieces: the **"Kaneo"** set by Kadagaden — an open set styled after
  chess.com's Neo — licensed **CC-BY-4.0**. Source:
  https://github.com/Kadagaden/chess-pieces · See `img/pieces-kaneo/CREDITS.txt`.
- Move legality: [chess.js](https://github.com/jhlywa/chess.js) (BSD).
