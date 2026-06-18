// A lightweight, dependency-free chessboard: renders a chess.js position,
// supports click-to-move, legal-move hints, and last-move / check highlighting.

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

// "Kaneo" piece set (CC-BY-4.0) — an open set styled after chess.com's Neo.
// Vendored under img/pieces-kaneo/ as e.g. wp.svg, bn.svg.
const pieceSrc = (color, type) => `img/pieces-kaneo/${color}${type}.svg`;

export class Board {
  constructor(el, { orientation = "w", onMove = null } = {}) {
    this.el = el;
    this.orientation = orientation;
    this.onMove = onMove;
    this.game = null;
    this.interactive = false;
    this.selected = null;
    this.lastMove = null;     // {from, to}
    this.squares = {};        // square name -> element
    this._build();
  }

  _build() {
    this.el.classList.add("board");
    this.el.innerHTML = "";
    const order = this._squareOrder();
    for (const sq of order) {
      const cell = document.createElement("div");
      const file = sq[0], rank = sq[1];
      const isLight = (FILES.indexOf(file) + Number(rank)) % 2 === 1;
      cell.className = "sq " + (isLight ? "light" : "dark");
      cell.dataset.square = sq;
      // coordinate labels (lichess style: file on bottom row, rank on left column)
      const showFile = this.orientation === "w" ? rank === "1" : rank === "8";
      const showRank = this.orientation === "w" ? file === "a" : file === "h";
      if (showRank) {
        const r = document.createElement("span");
        r.className = "coord rank";
        r.textContent = rank;
        cell.appendChild(r);
      }
      if (showFile) {
        const f = document.createElement("span");
        f.className = "coord file";
        f.textContent = file;
        cell.appendChild(f);
      }
      const piece = document.createElement("span");
      piece.className = "piece";
      cell.appendChild(piece);
      cell.addEventListener("click", () => this._onClick(sq));
      this.el.appendChild(cell);
      this.squares[sq] = cell;
    }
  }

  _squareOrder() {
    const ranks = this.orientation === "w" ? RANKS : [...RANKS].reverse();
    const files = this.orientation === "w" ? FILES : [...FILES].reverse();
    const order = [];
    for (const r of ranks) for (const f of files) order.push(f + r);
    return order;
  }

  setOrientation(o) {
    if (o === this.orientation) return;
    this.orientation = o;
    this._build();
    if (this.game) this.setPosition(this.game, this.lastMove);
  }

  flip() {
    this.setOrientation(this.orientation === "w" ? "b" : "w");
  }

  setInteractive(on) {
    this.interactive = on;
    if (!on) this._clearSelection();
    this.el.classList.toggle("interactive", on);
  }

  setPosition(game, lastMove = null) {
    this.game = game;
    this.lastMove = lastMove;
    this._clearSelection();
    const board = game.board(); // 8x8 array, rank 8 -> rank 1
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = FILES[f] + (8 - r);
        const cell = this.squares[sq];
        const pieceEl = cell.querySelector(".piece");
        const p = board[r][f];
        if (p) {
          pieceEl.style.backgroundImage = `url("${pieceSrc(p.color, p.type)}")`;
        } else {
          pieceEl.style.backgroundImage = "";
        }
        cell.classList.remove("last-move", "check");
      }
    }
    if (lastMove) {
      this.squares[lastMove.from]?.classList.add("last-move");
      this.squares[lastMove.to]?.classList.add("last-move");
    }
    if (game.in_check && game.in_check()) {
      const king = this._findKing(game.turn());
      if (king) this.squares[king]?.classList.add("check");
    }
  }

  _findKing(color) {
    const board = this.game.board();
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p && p.type === "k" && p.color === color) return FILES[f] + (8 - r);
      }
    return null;
  }

  _onClick(sq) {
    if (!this.interactive || !this.game) return;
    const piece = this.game.get(sq);
    if (this.selected) {
      if (sq === this.selected) { this._clearSelection(); return; }
      // is sq a legal destination from the selected square?
      const legal = this.game
        .moves({ square: this.selected, verbose: true })
        .some((m) => m.to === sq);
      if (legal) {
        const from = this.selected;
        this._clearSelection();
        if (this.onMove) this.onMove(from, sq);
        return;
      }
      // re-select another own piece, else clear
      if (piece && piece.color === this.game.turn()) this._select(sq);
      else this._clearSelection();
    } else {
      if (piece && piece.color === this.game.turn()) this._select(sq);
    }
  }

  _select(sq) {
    this._clearSelection();
    this.selected = sq;
    this.squares[sq].classList.add("selected");
    for (const m of this.game.moves({ square: sq, verbose: true })) {
      const target = this.squares[m.to];
      target.classList.add(this.game.get(m.to) ? "capture-hint" : "move-hint");
    }
  }

  _clearSelection() {
    this.selected = null;
    for (const sq in this.squares) {
      this.squares[sq].classList.remove("selected", "move-hint", "capture-hint");
    }
  }

  shake() {
    this.el.classList.remove("shake");
    void this.el.offsetWidth; // restart animation
    this.el.classList.add("shake");
  }
}
