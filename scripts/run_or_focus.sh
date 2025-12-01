#!/bin/bash

APP=$1

# Check if the app is already running
if pgrep -x "$APP" > /dev/null; then
    # Try to focus existing window
    WID=$(xdotool search --onlyvisible --class "$APP" | head -n 1)
    if [ -n "$WID" ]; then
        xdotool windowactivate "$WID"
        exit 0
    fi
fi

# If not running (or no window found), launch it
"$APP" &
