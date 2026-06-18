import re, sys
import chess

text = open("js/repertoire.js", encoding="utf-8").read()
lines_src = text.split("\n")

san_re = re.compile(r'san:\s*"((?:[^"\\]|\\.)*)"')
header_re = re.compile(r'name:\s*"((?:[^"\\]|\\.)*)".*moves:')

drills = []          # list of (name, [san, ...])
current_name = None
current_moves = None

for raw in lines_src:
    h = header_re.search(raw)
    if h:
        if current_name is not None:
            drills.append((current_name, current_moves))
        current_name = h.group(1)
        current_moves = []
        continue
    if current_moves is not None:
        m = san_re.search(raw)
        if m:
            current_moves.append(m.group(1))
if current_name is not None:
    drills.append((current_name, current_moves))

errors = 0
move_total = 0
for name, moves in drills:
    board = chess.Board()
    for ply, san in enumerate(moves, 1):
        move_total += 1
        try:
            board.push_san(san)
        except Exception as e:
            errors += 1
            print(f'ILLEGAL: ["{name}"] ply {ply}: "{san}"')
            print(f"  FEN before: {board.fen()}")
            print(f"  Legal: {[board.san(m) for m in board.legal_moves]}")
            break

print(f"\nChecked {len(drills)} lines, {move_total} moves.")
print("ALL LINES LEGAL" if errors == 0 else f"{errors} ILLEGAL MOVE(S)")
sys.exit(0 if errors == 0 else 1)
