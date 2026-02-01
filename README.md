# Telepromo UI

Cross‑platform desktop UI for the Telepromo backend.

## Requirements
- Node 20+
- Tauri prerequisites (Linux: webkit2gtk, rsvg2, etc.)
- Telepromo backend running locally

## Run (Dev)
```bash
npm install
npm run tauri dev
```

## Backend
Start the API from the backend repo:
```bash
cd /home/phantom/Documents/telepromo/telegramGatherTool
python3 api_server.py
```

The UI connects to `http://127.0.0.1:8000` by default. Override via:
```bash
VITE_API_BASE=http://127.0.0.1:8000
```

## Features (MVP)
- Backend status
- Sessions list
- Quick DM campaign form
- Actions & audit log tail

