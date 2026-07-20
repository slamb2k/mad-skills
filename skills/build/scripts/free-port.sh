#!/usr/bin/env bash
# free-port.sh — Print a free TCP port for the --auto evidence-capture dev server.
# Binds to port 0 so the OS assigns an unused port, then prints it to stdout.
# Dynamic allocation keeps concurrent --auto runs from colliding on a fixed
# default port (AC-006, REQ-022).
# Usage: free-port.sh
# Exit codes: 0=port printed, 1=no allocator available
set -uo pipefail

# ponytail: inherent TOCTOU race — the port can be taken between print and bind.
# GUD-003's queue-under-contention design is the upgrade path if it ever bites.
if command -v node >/dev/null 2>&1; then
  node -e 's=require("net").createServer();s.listen(0,()=>{p=s.address().port;s.close(()=>console.log(p));});'
  exit 0
fi

if command -v python3 >/dev/null 2>&1; then
  python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()'
  exit 0
fi

echo "free-port.sh: no port allocator (node or python3) available" >&2
exit 1
