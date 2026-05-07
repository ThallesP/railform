# railform

Railform stages Railway environment changes from a TypeScript config, then
commits those staged changes when you are ready.

`preview` prints Railform's plan without writing to Railway. `apply` creates any
missing Railway resources, stages the environment config patch, and commits it.

Projects, services, and databases are Railway resources, so they are created
before staging environment config. `.railform/state.json` stores only the
project ID and a small service ID map so a local config keeps pointing at the
same Railway resources.
Railform does not adopt existing projects by name; without a saved project ID,
the configured project is treated as missing.

## Config

Create `railform.config.ts` in your project:

```bash
railform init
```

`init` verifies your Railway authentication and writes a starter config. It does not
create or change any Railway resources.

```ts
import { Postgres, Project, Service, promptVariable } from "@railform/core";

export default new Project({
	name: "Notus API",
	workspaceId: "your-railway-workspace-id",
	environment: "production",
	sharedVariables: {
		API_URL: "https://api.example.com",
	},
	databases: [
		new Postgres({
			name: "postgres",
		}),
	],
	services: [
		new Service({
			name: "api",
			source: {
				repo: "acme/notus-api",
				branch: "main",
			},
			databases: ["postgres"],
			variables: {
				NODE_ENV: "production",
				API_TOKEN: promptVariable("Enter Notus API token"),
			},
			deploy: {
				startCommand: "bun run start",
			},
		}),
	],
});
```

Database resources are declared with engine-specific classes: `Postgres`,
`MySQL`, `MongoDB`, and `Redis`. Linking a service to a database adds Railway
reference variables for that database's standard connection variables, such as
`DATABASE_URL=${{postgres.DATABASE_URL}}` for PostgreSQL or
`REDIS_URL=${{redis.REDIS_URL}}` for Redis. Service and environment names are
resolved to Railway IDs before staging, because Railway staged patches are keyed
by IDs.

Use a custom mapping when an app expects different variable names:

```ts
new Service({
	name: "worker",
	databases: [
		{
			name: "postgres",
			variables: {
				PG_URL: "DATABASE_URL",
			},
		},
	],
});
```

Use a Docker image source instead of GitHub when the service should deploy a
prebuilt image:

```ts
new Service({
	name: "worker",
	source: {
		image: "ghcr.io/acme/worker:latest",
	},
});
```

Services can also model Railway deploy settings such as health checks,
replicas, cron schedules, pre-deploy commands, draining windows, restart policy,
sleep behavior, Dockerfile paths, and watch patterns.

Use `railwayRef`, `railwayPublicUrl`, and `railwayPrivateUrl` for service
references instead of hand-writing Railway expression strings. Use
`randomSecret(length)` for Railway-generated secret expressions such as
`${{secret(48)}}`.

Use `promptVariable` for values that should not live in source control.
`preview` shows a redacted placeholder, and `apply` asks for the real value
before writing to Railway.

## Commands

Preview the config without writing to Railway:

```bash
railform preview
```

The plan output is grouped by human-readable additions, updates, and removals:

```text
Project: Notus API
Environment: production

Plan:
[+] create Railway service api
[+] create Railway database postgres

Staged changes:
[+] add source for api
[+] add branch for api
[+] add env variable DATABASE_URL to api = "${{postgres.DATABASE_URL}}"
[+] add env variable PGHOST to api = "${{postgres.PGHOST}}"
[+] add env variable NODE_ENV to api = a redacted value
[~] update start command for api = "bun run start"
[-] remove shared env variable LEGACY_API_URL
```

`plan` is kept as a read-only alias for `preview`.

Open the Railway project page after previewing:

```bash
railform preview --web
```

If Railform cannot open a browser, it prints the Railway link instead.

Apply the config:

```bash
railform apply
```

`apply` fails if the target environment already has different staged config keys,
so Railform does not overwrite dashboard-created or unrelated pending changes.

For an agent-safe human review loop, request approval instead of waiting on an
interactive prompt:

```bash
railform apply --request-approval --format json
```

Railform stages the patch, stores a local approval record, and exits. The agent
should show the human the returned review and approve commands:

```bash
railform review rf_abc123
railform approve rf_abc123
```

After approval, the agent can continue without prompts:

```bash
railform apply --approval rf_abc123 --wait --format json
```

`apply --approval` re-reads Railway staged changes and refuses to continue if
the fingerprint no longer matches what the human approved.

Prompt variables can be supplied non-interactively:

```bash
railform apply --request-approval --var api.API_TOKEN=secret --format json
```

Use `SERVICE.KEY=value` for service variables and `KEY=value` for shared
variables.

To deliberately bypass the human approval request in automation, set:

```bash
RAILFORM_DANGEROUSLY_SKIP_PERMISSIONS=1 railform apply --request-approval
```

This is intentionally noisy and applies immediately.
