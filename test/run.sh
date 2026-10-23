#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Bearer token used by the server tests. Must match what the server sees.
export API_TOKEN="${API_TOKEN:-dev-token-change-me}"

echo "==> C unit tests"
make test

echo "==> addon integration"
# test_addon.js is a manual demo — start it in a terminal and Ctrl-C
# when done. It's deliberately not part of this automated run because
# it blocks waiting for a human to press Ctrl-C.
#
# test_exit.js calls process.exit(0) inside the test to verify env
# teardown, which kills the test-runner process. It must be run in its
# OWN node --test invocation; batching it with other files would skip
# them. Each file below runs in a separate process for this reason.
sudo node --test addon/tests/test_api.js
sudo node --test addon/tests/test_concurrency.js
sudo node --test addon/tests/test_swap.js
sudo node --test addon/tests/test_cycle.js
sudo node --test addon/tests/test_exit.js

echo "==> build server"
(cd server && npm run build)

echo "==> server + WS integration"
sudo env \
    CAPTURE_INTERFACE=lo \
    PORT=3000 \
    API_TOKEN="$API_TOKEN" \
    node server/dist/index.js &
SERVER_PID=$!
trap 'kill -SIGINT "$SERVER_PID" 2>/dev/null || true' EXIT

for i in {1..20}; do
  if curl -sf http://localhost:3000/api/health >/dev/null; then break; fi
  sleep 0.5
  if [[ $i -eq 20 ]]; then echo "server did not start"; exit 1; fi
done

API_TOKEN="$API_TOKEN" node server/tests/test_http.js
API_TOKEN="$API_TOKEN" node server/tests/test_security.js
API_TOKEN="$API_TOKEN" node server/tests/test_ws.js

echo "==> dashboard unit tests"
(cd dashboard && npm test)

echo "all green"