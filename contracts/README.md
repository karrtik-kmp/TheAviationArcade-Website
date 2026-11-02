# Contracts

Files shared with the other repos. Nothing here is edited by hand.

| File | Source | Copy rule |
|---|---|---|
| `catalog.v1.json` | `Backend/contracts/catalog.v1.json` (backend B2, `16351d0`) | Byte copy of the backend's committed file (LF). Unity `ModuleRegistry` is the origin of the values; the backend mirrors it and publishes this file. When the backend republishes it, copy it again with `git -C <Backend> show HEAD:contracts/catalog.v1.json > contracts/catalog.v1.json`. `tests/catalog.test.mjs` checks the website catalog against it. |
| `backend-progress.example.json` | Written for the website's tests | A sample `GET /v1/me/progress` response shaped by `Backend/docs/openapi.yaml` (0.4.0) `ProgressEnvelope`. The values are test data, not real progress. `tests/progress.test.mjs` checks it against the strict Progress schema. |
