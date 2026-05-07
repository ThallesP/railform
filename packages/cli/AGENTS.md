# Railform Agent Guide

Use this guide when editing `railform.config.ts` or helping with Railform commands.

## Workflow

- Inspect the installed Railform package before changing config syntax. Useful entry points are `node_modules/railform` and `node_modules/@railform/core`.
- A Railform config should default export a `Project` from `@railform/core`.
- Use `Service` for each Railway service and `promptVariable` for secrets that should be requested during `railform apply`.
- Run `railform plan` to preview changes before `railform apply`.
- To apply as an agent, use `railform apply --request-approval --format json` and tell the human to run the returned `railform review <approval-id>` and `railform approve <approval-id>` commands.
- After the human approves, continue with `railform apply --approval <approval-id> --wait --format json`.
- Do not wait inside the first approval request. It exits after staging and recording the approval.
- Pass prompt variables with `--var SERVICE.KEY=value` for service variables or `--var KEY=value` for shared variables.
- Only use `RAILFORM_DANGEROUSLY_SKIP_PERMISSIONS=1` when the human explicitly wants to bypass the approval handoff.

## Example

```ts
import { Project, Service, promptVariable } from "@railform/core";

export default new Project({
	name: "My Railway Project",
	environment: "production",
	services: [
		new Service({
			name: "web",
			variables: {
				DATABASE_URL: promptVariable("Database connection string"),
			},
			deploy: {
				startCommand: "bun run start",
			},
		}),
	],
});
```
