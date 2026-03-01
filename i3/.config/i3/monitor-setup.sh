#!/bin/sh
MON=$(xrandr | grep -E "HDMI" | grep -oP "^HDMI-\d" | head -1 )
echo $MON
[ -n "$MON" ] && i3-msg "workspace 1 output $MON; workspace 2 output $MON"

