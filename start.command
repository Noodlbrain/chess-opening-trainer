#!/bin/bash
# Double-click this file (or run it) to launch the Opening Trainer.
cd "$(dirname "$0")"
PORT=8123
echo "Starting Opening Trainer at http://localhost:$PORT ..."
( sleep 1 && open "http://localhost:$PORT/index.html" ) &
python3 -m http.server $PORT
