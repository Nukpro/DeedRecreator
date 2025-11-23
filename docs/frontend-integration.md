# Frontend Integration Plan

This document captures the current API contracts and the agreed setup for the modernised frontend build pipeline.

## API contracts

### `POST /api/upload-document`

- **Payload**: multipart form (`document` field).
- **Success 201 body**:
  - `message`: human-readable status.
  - `payload`:
    - `originalFilename`
    - `originalStoredFilename`
    - `originalStoredRelativePath`
    - `storedFilename`
    - `storedRelativePath`
    - `wasConverted` (bool)
    - `warnings` (array of strings)
    - `imageUrl`, `originalUrl` (relative URLs to retrieve assets)
    - `imageWidth`, `imageHeight`
    - `boundaryBox` (`minX`, `minY`, `maxX`, `maxY`)
- **Error 400/500 body**:
  - `message`: reason (unsupported type, storage failure, etc.).

### `GET /uploads/<filename>`

- Serves binary content from `UPLOAD_DIR`.
- Currently unrestricted; downstream auth requirements must wrap this endpoint before production.

## Frontend stack decision

The prototype stays server-rendered via Flask templates, but all interactive behaviour is now sourced from a dedicated `frontend/` workspace managed with Vite. This keeps the door open for a future SPA if the team elects, while keeping shipping velocity for the current prototype.

Key points:

- Source lives in `frontend/src`.
- We export an ES-module bundle (`static/dist/drafter.js`) plus CSS (`static/dist/drafter.css`) consumed by Jinja templates.
- The Drafter page is the first consumer; additional pages should follow the same entry-point convention (`static/dist/<page>.js`).

## Tooling workflow

```bash
cd frontend
npm install        # installs dev dependencies
npm run dev        # Vite dev server (HMR) at http://127.0.0.1:5173
npm run build      # outputs to ../static/dist
npm run lint       # ESLint over src/**/*.js
```

During Flask development you can either:

1. Run `npm run dev` and point the browser at Vite (proxy API requests to Flask), or
2. Run `npm run build -- --watch` to emit bundles into `static/dist` while using the Flask dev server.

## Next steps for the team

- Add additional entry points as new UI surfaces emerge (e.g. `/static/dist/admin.js`).
- Introduce TypeScript or React if needed; Vite config already supports TS out of the box.
- Gate API calls through a shared client module to centralise error handling and future auth tokens.

