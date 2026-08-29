# Phonton Desktop

Private desktop shell for Phonton.

This package lives outside `phonton-dev/` so it does not ship in the public
CLI subtree. Desktop is the control room over the local ADE: goals, cheap-first
routing, verification, and receipts.

Current app version: 0.3.3. Requires phonton-cli 0.21.0 or newer (`0.21.1` once published) for live serve. Cost receipts appear when the engine publishes `cost_receipt` on GlobalState.

The Tauri app can spawn `phonton serve` on port 47831. Vite in a browser cannot spawn the sidecar; start `phonton serve` yourself if you preview the UI in a browser.
