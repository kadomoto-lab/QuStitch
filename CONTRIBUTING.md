# Contributing

Thanks for your interest in QuStitch. Issues and pull requests are welcome.

## Development setup

- Frontend: `cd frontend && npm install && npm run dev` (Node 20 or later).
- Backend: see [backend/README.md](backend/README.md). Generating traces
  requires the pinned XQsim dependency set (Python 3.10); the Docker image is
  the easiest way to get a working environment.

## Before opening a pull request

Run the same checks as CI:

```bash
cd frontend
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build

cd ../backend
ruff check . && ruff format --check qustitch_trace tools tests && python -m pytest -q
```

## Guidelines

- Keep `backend/xqsim/` (vendored XQsim) byte-identical to upstream except for
  the changes documented in [backend/UPSTREAM.md](backend/UPSTREAM.md). Put new
  behaviour in `backend/qustitch_trace/` instead.
- Trace files under `frontend/public/` are generated artifacts. Regenerate them
  with `python tools/regenerate_samples.py` rather than editing them by hand,
  and mention the backend change that required regeneration in the commit.
- Write code comments and documentation in English. UI strings live in
  `frontend/src/i18n/messages.ts` and need both an English and a Japanese entry.
