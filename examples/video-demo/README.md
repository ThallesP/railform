# Railform Video Demo

Tiny Elysia API with one Postgres table.

## Run Locally

```bash
bun install
DATABASE_URL=postgres://user:password@localhost:5432/postgres bun run dev
```

## Deploy

```bash
npm install -g railform
railway login
railform init
railform plan
railform apply
```

Endpoints:

- `GET /health`
- `GET /notes`
- `POST /notes` with `{ "body": "hello" }`
