This folder stores packaged backend sidecar artifacts for Linux installers.

Generate them with:
`npm run prepare:linux-sidecar`

Required files:
- `tgcampaigner-backend-linux-x64`
- `tgcampaigner-backend-linux-x64.sha256`

Runtime behavior:
- The desktop app auto-starts this sidecar if nothing is listening on `127.0.0.1:8000`.
- Backend runtime data is isolated in app data under `backend-home/`.
