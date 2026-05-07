# railform

Railform is a TypeScript config layer for Railway. It previews, stages, and
applies Railway projects, services, databases, variables, domains, and deploy
settings from `railform.config.ts`.

It is designed to be usable by humans and agents:

- `railform plan` is read-only.
- `railform apply --request-approval` can hand changes to a human for review.
- `railform apply --approval <id>` lets an agent continue after approval without
  getting stuck on prompts.
- `RAILFORM_DANGEROUSLY_SKIP_PERMISSIONS=1` exists for explicit no-review
  automation.

## Install

```bash
npm install -g railform
```

Railform uses your existing Railway auth. Log in with Railway before applying:

```bash
railway login
```

## Quickstart

Create a config:

```bash
railform init
```

Edit `railform.config.ts`:

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

Preview changes:

```bash
railform plan
```

Apply directly:

```bash
railform apply
```

## Agent Approval Flow

Ask for human review and exit:

```bash
railform apply --request-approval --format json
```

The human reviews and approves:

```bash
railform review <approval-id>
railform approve <approval-id>
```

The agent continues without prompts:

```bash
railform apply --approval <approval-id> --wait --format json
```

For automation where the human already chose to skip review:

```bash
RAILFORM_DANGEROUSLY_SKIP_PERMISSIONS=1 railform apply --request-approval --wait --format json
```

## Useful Helpers

```ts
import {
	promptVariable,
	railwayPrivateUrl,
	railwayPublicUrl,
	railwayRef,
	randomSecret,
} from "@railform/core";
```

- `randomSecret(48)` creates `${{secret(48)}}`.
- `promptVariable("API token")` asks at apply time or via `--var`.
- `railwayRef("api", "RAILWAY_PRIVATE_DOMAIN")` creates Railway references.
- `railwayPublicUrl("web")` and `railwayPrivateUrl("api")` create service URLs.

Prompt variables can be passed non-interactively:

```bash
railform apply --request-approval --var api.API_TOKEN=secret --format json
```

## Skills

Railform ships agent instructions in the package:

```text
node_modules/@railform/core/agent-skills/railway-stack/SKILL.md
```
