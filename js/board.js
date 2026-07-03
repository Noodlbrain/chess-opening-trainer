// A lightweight, dependency-free chessboard: renders a chess.js position,
// supports click-to-move, drag-and-drop, keyboard play (arrows + Enter),
// legal-move hints, and last-move / check highlighting.

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
    this.cursor = null;       // keyboard cursor square
    this.drag = null;         // active pointer interaction
    this._onDragMove = (e) => this._pointerMove(e);
    this._onDragUp = (e) => this._pointerUp(e);
    el.tabIndex = -1;
    el.setAttribute("role", "application");
    el.setAttribute("aria-label", "Chessboard. Arrow keys move the cursor; Enter selects a piece or plays the move.");
    el.addEventListener("keydown", (e) => this._onKey(e));
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
      cell.addEventListener("pointerdown", (e) => this._pointerDown(sq, e));
      cell.addEventListener("click", () => this._clickFallback(sq));
      this.el.appendChild(cell);
      this.squares[sq] = cell;
    }
    if (this.cursor) this.squares[this.cursor]?.classList.add("cursor");
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
    this.el.tabIndex = on ? 0 : -1;
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

  _isLegal(from, to) {
    return this.game.moves({ square: from, verbose: true }).some((m) => m.to === to);
  }

  _squareAt(x, y) {
    const cell = document.elementFromPoint(x, y)?.closest?.(".sq");
    return cell && this.el.contains(cell) ? cell.dataset.square : null;
  }

  // ---------------- pointer input: unified tap / click / drag ----------------
  _pointerDown(sq, e) {
    if (!this.interactive || !this.game) return;
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    this._setCursor(sq); // keyboard cursor follows the mouse
    const piece = this.game.get(sq);
    this._pointerSeen = true; // the trailing click event is ours — skip the fallback
    if (piece && piece.color === this.game.turn()) {
      const wasSelected = this.selected === sq;
      if (!wasSelected) this._select(sq);
      this.drag = {
        from: sq, wasSelected, moved: false,
        x: e.clientX, y: e.clientY,
        el: this.squares[sq].querySelector(".piece"),
      };
    } else {
      this.drag = { from: null, tap: sq };
    }
    window.addEventListener("pointermove", this._onDragMove);
    window.addEventListener("pointerup", this._onDragUp);
    window.addEventListener("pointercancel", this._onDragUp);
  }

  _pointerMove(e) {
    const d = this.drag;
    if (!d || !d.from) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
      d.moved = true;
      d.size = this.squares[d.from].getBoundingClientRect().width;
      d.el.classList.add("dragging");
      d.el.style.position = "fixed";
      d.el.style.width = d.size + "px";
      d.el.style.height = d.size + "px";
      d.el.style.zIndex = "50";
    }
    d.el.style.left = e.clientX - d.size / 2 + "px";
    d.el.style.top = e.clientY - d.size / 2 + "px";
    const over = this._squareAt(e.clientX, e.clientY);
    if (over !== d.over) {
      if (d.over) this.squares[d.over]?.classList.remove("drag-over");
      d.over = over;
      if (over) this.squares[over]?.classList.add("drag-over");
    }
  }

  _pointerUp(e) {
    const d = this.drag;
    this.drag = null;
    window.removeEventListener("pointermove", this._onDragMove);
    window.removeEventListener("pointerup", this._onDragUp);
    window.removeEventListener("pointercancel", this._onDragUp);
    if (!d) return;
    if (d.over) this.squares[d.over]?.classList.remove("drag-over");
    if (!d.from) {
      // tap that started on an empty or enemy square: complete a click-move
      const target = this._squareAt(e.clientX, e.clientY);
      if (target === d.tap) this._tapSquare(d.tap);
      return;
    }
    d.el.classList.remove("dragging");
    d.el.style.cssText = "";
    if (d.moved) {
      const target = e.type === "pointercancel" ? null : this._squareAt(e.clientX, e.clientY);
      if (target && target !== d.from && this._isLegal(d.from, target)) {
        this._clearSelection();
        if (this.onMove) this.onMove(d.from, target);
      }
      // otherwise the piece snaps back; keep the selection for a follow-up click
    } else if (d.wasSelected) {
      this._clearSelection(); // tapping an already-selected piece toggles it off
    }
  }

  // Synthetic clicks (assistive tech, tests) emit no pointer events — handle
  // them here; real pointer input was already consumed by _pointerDown/Up.
  _clickFallback(sq) {
    if (this._pointerSeen) { this._pointerSeen = false; return; }
    this._tapSquare(sq);
  }

  // shared tap semantics for clicks and keyboard Enter
  _tapSquare(sq) {
    if (!this.interactive || !this.game) return;
    const piece = this.game.get(sq);
    if (this.selected) {
      if (sq === this.selected) { this._clearSelection(); return; }
      if (this._isLegal(this.selected, sq)) {
        const from = this.selected;
        this._clearSelection();
        if (this.onMove) this.onMove(from, sq);
        return;
      }
      if (piece && piece.color === this.game.turn()) this._select(sq);
      else this._clearSelection();
    } else if (piece && piece.color === this.game.turn()) {
      this._select(sq);
    }
  }

  // ---------------- keyboard play ----------------
  _onKey(e) {
    if (!this.interactive) return;
    const k = e.key;
    if (k === "ArrowRight") this._moveCursor(1, 0);
    else if (k === "ArrowLeft") this._moveCursor(-1, 0);
    else if (k === "ArrowUp") this._moveCursor(0, 1);
    else if (k === "ArrowDown") this._moveCursor(0, -1);
    else if (k === "Enter" || k === " ") {
      if (!this.cursor) this._setCursor(this._defaultCursor());
      this._tapSquare(this.cursor);
    } else if (k === "Escape") { this._clearSelection(); return; }
    else return;
    e.preventDefault();
    e.stopPropagation(); // don't let Learn-mode line navigation also fire
  }

  _defaultCursor() {
    return this.orientation === "w" ? "e2" : "e7";
  }

  _moveCursor(dx, dy) {
    const cur = this.cursor || this._defaultCursor();
    const flip = this.orientation === "b" ? -1 : 1;
    const f = FILES.indexOf(cur[0]) + dx * flip;
    const r = Number(cur[1]) + dy * flip;
    if (f < 0 || f > 7 || r < 1 || r > 8) return;
    this._setCursor(FILES[f] + r);
  }

  _setCursor(sq) {
    if (this.cursor) this.squares[this.cursor]?.classList.remove("cursor");
    this.cursor = sq;
    this.squares[sq]?.classList.add("cursor");
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
