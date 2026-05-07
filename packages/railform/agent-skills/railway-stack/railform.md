# Railform Reference

Use this for Railform command examples, approval flow details, config helpers,
and common gotchas.

## Discover

```bash
railform --help
railform plan
```

After `railform init`, always run `railform plan`. If the config cannot load
because `@railform/core` is missing, install it with the project package manager:

```bash
bun add -d @railform/core
npm install -D @railform/core
pnpm add -D @railform/core
yarn add -D @railform/core
```

If `railform plan` says a workspace is needed, set the workspace explicitly
before running mutating commands:

```bash
export RAILWAY_WORKSPACE_ID=<workspace-id>
```

For demos or recordings, avoid displaying workspace enumeration. Prefer
`RAILWAY_WORKSPACE_ID`, saved `.railform/state.json`, or a user-provided
workspace name; if a command prints multiple workspaces, summarize only the
selected workspace.

## App Inspection Checklist

Before writing `railform.config.ts`, inspect:

- Package manager and production start command from lockfiles and
  `package.json`.
- Required env vars from `.env.example`, docs, framework config, and runtime
  validation.
- Health route. Prefer a real app route such as `/health`; do not invent one
  unless you also implement it.
- Database usage and required connection variables.
- Git source. Use `git remote -v` to infer `source.repo` for GitHub repos and
  `git branch --show-current` for `source.branch`.
- Whether any HTTP service should be public.

Remove generated placeholders such as `API_TOKEN`, `SESSION_SECRET`, and
`INTERNAL_API_URL` unless the app actually needs them.

## Human Approval Flow

Use this flow when an agent needs to apply changes without getting stuck on a
prompt.

Request approval and exit:

```bash
railform apply --request-approval --format json
```

The JSON output includes an `approvalId` and human commands. Tell the human to
review and approve:

```bash
railform review <approval-id>
railform approve <approval-id>
```

Continue only after the human approves:

```bash
railform apply --approval <approval-id> --wait --format json
```

`status: applied` means the Railway config commit succeeded. Do not call the
deployment complete until Railway reports the service deploy healthy or an HTTP
health check succeeds.

If the config contains prompt variables, pass them explicitly so the command does
not prompt:

```bash
railform apply --request-approval --format json --var web.API_TOKEN=<secret>
railform apply --request-approval --format json --var SHARED_KEY=<value>
```

## Direct Override

Only use this when the human explicitly requests bypassing review:

```bash
RAILFORM_DANGEROUSLY_SKIP_PERMISSIONS=1 railform apply --request-approval --wait --format json
```

## Useful Config APIs

Import from `@railform/core`:

```ts
import {
	MongoDB,
	MySQL,
	Postgres,
	Project,
	Redis,
	Service,
	promptVariable,
	railwayPrivateUrl,
	railwayPublicUrl,
	railwayRef,
	randomSecret,
} from "@railform/core";
```

- `promptVariable("message")` marks values that must be provided at apply time.
- `randomSecret(length)` creates a Railway-generated `${{secret(length)}}`
  expression. Use `randomSecret(length, charset)` when a restricted character
  set is needed.
- `railwayRef("service", "VARIABLE")` creates `${{service.VARIABLE}}`.
- `railwayPublicUrl("service")` creates an HTTPS URL to a public Railway domain.
- `railwayPrivateUrl("service")` creates an HTTPS URL to a private Railway
  domain.

Railform currently provides domain reference helpers, but does not declare or
create Railway public domains in `railform.config.ts`. For an HTTP service with
a health check, ask or default to a public domain, then explicitly tell the user
before apply if that domain cannot be created declaratively yet.

## Example Service

```ts
new Service({
	name: "api",
	source: {
		repo: "acme/notus-api",
		branch: "main",
	},
	databases: ["postgres", "redis"],
	variables: {
		NODE_ENV: "production",
	},
	deploy: {
		startCommand: "bun run start",
		healthcheckPath: "/health",
		restartPolicyType: "ON_FAILURE",
	},
});
```

Add prompt variables only for external secrets that cannot be generated. Add
`randomSecret` only when the application needs a generated secret.

## Public HTTP Services

For a service with an HTTP server and `healthcheckPath`:

1. Ask whether to expose a public domain, or default to public for demos and
   user-facing apps.
2. If Railform cannot declare the public domain yet, say that before apply and
   do not imply the config will create one.
3. After apply, surface the generated URL when available.
4. Verify health:

```bash
curl -fsS https://<public-domain>/health
```

If the health path is different, use the configured `healthcheckPath`.

## Post-Apply Verification

After `railform apply --approval <approval-id> --wait --format json`:

- Confirm any Railway deploy associated with changed services is healthy. If the
  deploy fails, report the service, deploy ID, status, and error text.
- Confirm the public domain is available before presenting the URL as ready.
- Run `curl -fsS <url><healthcheckPath>` for HTTP services with public domains.
- Only call the deployment complete after Railway reports the service deploy
  healthy or the HTTP health check succeeds.

## Gotchas

- `railform plan` is read-only. Use it before changing resources.
- `apply --request-approval` stages changes and creates an approval request; it
  is the normal agent handoff, not the final deploy step.
- Approval fingerprints are checked before approval and before continuation. If
  staged changes drift, request a new approval.
- `promptVariable` values are intentionally absent from source control. Use
  `--var` for automation and ask the human only for values that cannot be
  generated.
- `randomSecret(length, charset?)` maps to Railway's secret expression and is
  better than inventing a local secret value.
- If a Docker image, service config, or deploy wait fails, treat the failure as
  actionable feedback: report the exact Railform output, update
  `railform.config.ts` or Railform, then rerun `railform plan`.
- App services need a source. Prefer `source.repo` and `source.branch` inferred
  from git for GitHub-backed applications.
