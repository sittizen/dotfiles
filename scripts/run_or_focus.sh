#!/bin/bash
# Script to run an application or focus its window if already running in i3

APP=$1
if pgrep -x "$APP" > /dev/null; then
    WID=$(xdotool search --onlyvisible --class "$APP" | head -n 1)
    if [ -n "$WID" ]; then
        xdotool windowactivate "$WID"
        exit 0
    fi
fi
"$APP" &
