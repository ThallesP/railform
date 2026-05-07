# railform

Railform is a TypeScript config layer for Railway. It previews, stages, and
applies Railway projects, services, databases, variables, domains, and deploy
settings from `railform.config.ts`.

## Install

```bash
npm install -g railform
railway login
```

## Quickstart

Create a config:

```bash
railform init
```

Preview changes:

```bash
railform plan
```

Apply changes:

```bash
railform apply
```

## Minimal Config

```ts
import { Postgres, Project, Redis, Service, randomSecret } from "@railform/core";

export default new Project({
	name: "my-app",
	workspaceId: "your-railway-workspace-id",
	environment: "production",
	databases: [new Postgres({ name: "postgres" }), new Redis({ name: "redis" })],
	services: [
		new Service({
			name: "api",
			databases: ["postgres", "redis"],
			variables: {
				NODE_ENV: "production",
				SESSION_SECRET: randomSecret(48),
			},
			deploy: {
				startCommand: "bun run start",
				healthcheckPath: "/health",
			},
		}),
	],
});
```

## Agent Approval Flow

Request human review and exit:

```bash
railform apply --request-approval --format json
```

Human review:

```bash
railform review <approval-id>
railform approve <approval-id>
```

Continue after approval:

```bash
railform apply --approval <approval-id> --wait --format json
```

Skip approval only when the user explicitly asked for it:

```bash
RAILFORM_DANGEROUSLY_SKIP_PERMISSIONS=1 railform apply --request-approval --wait --format json
```

## Helpers

- `randomSecret(48)` creates `${{secret(48)}}`.
- `promptVariable("API token")` asks at apply time or via `--var`.
- `railwayRef("api", "RAILWAY_PRIVATE_DOMAIN")` creates Railway references.
- `railwayPublicUrl("web")` and `railwayPrivateUrl("api")` create service URLs.

Agent instructions ship at:

```text
node_modules/@railform/core/agent-skills/railway-stack/SKILL.md
```
