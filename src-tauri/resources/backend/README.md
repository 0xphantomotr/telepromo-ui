This folder stores packaged backend sidecar artifacts for desktop installers.

Generate Linux artifacts with:
`npm run prepare:linux-sidecar`

Generate Windows artifacts with:
`npm run prepare:windows-sidecar`

Expected Linux files:
- `tgcampaigner-backend-linux-x64`
- `tgcampaigner-backend-linux-x64.sha256`

Expected Windows files:
- `tgcampaigner-backend-windows-x64.exe`
- `tgcampaigner-backend-windows-x64.exe.sha256`

Runtime behavior:
- The desktop app auto-starts this sidecar if nothing is listening on `127.0.0.1:8000`.
- Backend runtime data is isolated in app data under `backend-home/`.
