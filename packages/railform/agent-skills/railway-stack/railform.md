# Railform Reference

Use this for Railform command examples, approval flow details, config helpers,
and common gotchas.

## Discover

```bash
railform --help
railform plan
```

If `railform plan` says a workspace is needed, set the workspace explicitly
before running mutating commands:

```bash
export RAILWAY_WORKSPACE_ID=<workspace-id>
```

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

## Example Service

```ts
new Service({
	name: "api",
	databases: ["postgres", "redis"],
	variables: {
		NODE_ENV: "production",
		SESSION_SECRET: randomSecret(48),
		API_TOKEN: promptVariable("API token"),
		WEB_URL: railwayPublicUrl("web"),
		INTERNAL_API_URL: railwayPrivateUrl("api"),
	},
	deploy: {
		startCommand: "bun run start",
		healthcheckPath: "/health",
		restartPolicyType: "ON_FAILURE",
	},
});
```

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
