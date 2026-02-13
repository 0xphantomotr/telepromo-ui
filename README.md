# TGCampaigner UI

Cross-platform desktop UI for the TGCampaigner backend.

## Requirements
- Node 20+
- Tauri prerequisites (Linux: webkit2gtk, rsvg2, etc.)
- TGCampaigner backend running locally (for dev)

## Run (Dev)
```bash
npm install
npm run tauri dev
```

## Backend
Start the API from the backend repo:
```bash
cd ../telegramGatherTool
python3 api_server.py
```

The UI connects to `http://127.0.0.1:8000` by default. Override via:
```bash
VITE_API_BASE=http://127.0.0.1:8000
```

## Build Linux Standalone (bundled backend sidecar)
This packages a local backend binary into the installer so end users do not need the backend repo.

```bash
npm run build:linux:standalone
```

The build script will:
1. Build `telegramGatherTool` sidecar binary (`tgcampaigner-backend-linux-x64`).
2. Copy it into `src-tauri/resources/backend/`.
3. Run `tauri build` and include it in Linux bundles.

## Features (MVP)
- Backend status
- Sessions list
- Quick DM campaign form
- Actions & audit log tail
