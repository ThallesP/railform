# @railform/core

Resource classes for describing Railway config patches.

```ts
import { Postgres, Project, Service, promptVariable } from "@railform/core";

export default new Project({
	name: "Notus API",
	environment: "production",
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
				API_TOKEN: promptVariable("Enter API token"),
			},
			deploy: {
				startCommand: "bun run start",
			},
		}),
	],
});
```

Database resources are declared with `Postgres`, `MySQL`, `MongoDB`, or `Redis`.
Database links add the documented connection variables for that database type,
such as `DATABASE_URL=${{postgres.DATABASE_URL}}` for PostgreSQL or
`REDIS_URL=${{redis.REDIS_URL}}` for Redis. Use
`{ name: "postgres", variables: { PG_URL: "DATABASE_URL" } }` for custom
variable names.

Use reference helpers when one service needs another service's Railway-provided
variables:

```ts
import {
	randomSecret,
	railwayPrivateUrl,
	railwayPublicUrl,
	railwayRef,
} from "@railform/core";

new Service({
	name: "api",
	variables: {
		JWT_SECRET: randomSecret(48),
		PUBLIC_WEB_URL: railwayPublicUrl("web"),
		WORKER_URL: railwayPrivateUrl("worker"),
		WORKER_HOST: railwayRef("worker", "RAILWAY_PRIVATE_DOMAIN"),
	},
});
```

Service sources can point at GitHub or a Docker image:

```ts
new Service({
	name: "worker",
	source: {
		image: "ghcr.io/acme/worker:latest",
	},
});
```

Deploy config supports common Railway service settings:

```ts
new Service({
	name: "scheduler",
	source: {
		image: "alpine:3.20",
	},
	deploy: {
		cronSchedule: "*/15 * * * *",
		startCommand: "sh -c 'date && echo running job'",
		preDeployCommand: ["echo preparing release"],
		healthcheckPath: "/health",
		healthcheckTimeout: 30,
		numReplicas: 2,
		drainingSeconds: 30,
		restartPolicyType: "ON_FAILURE",
		restartPolicyMaxRetries: 10,
		sleepApplication: false,
	},
});
```
