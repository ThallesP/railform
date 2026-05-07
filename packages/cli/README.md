# railform CLI

```bash
railform init
railform preview
railform plan
railform preview --web
railform apply
railform apply --request-approval
railform review <approval-id>
railform approve <approval-id>
railform reject <approval-id>
railform apply --approval <approval-id> --wait
```

`init` verifies your Railway authentication, selects a Railway workspace, creates a
starter `railform.config.ts`, and does not create or change any Railway
resources.
`preview` shows the Railform plan without writing to Railway. `plan` is a
read-only alias for `preview`. `apply` creates missing resources, stages the
environment config patch, and commits it.

If the config uses `promptVariable`, `preview` shows a redacted placeholder and
`apply` asks for the real value before writing. Agents should pass prompt values
with `--var SERVICE.KEY=value` for service variables or `--var KEY=value` for
shared variables.

Railway IDs are stored in `.railform/state.json` as one project ID and a small
service ID map. Missing projects, services, and databases are created during
`apply`. Existing projects are not adopted by name; without a saved project ID,
Railform treats the configured project as missing. Database resources are
declared with `Postgres`, `MySQL`, `MongoDB`, and `Redis`.

Services can link to databases with `databases: ["postgres"]`. Railform writes
Railway reference variables for the database's standard connection variables,
such as `DATABASE_URL=${{postgres.DATABASE_URL}}`, to the service.

Services can attach a source with `source: { repo: "owner/repo", branch:
"main" }` or `source: { image: "ghcr.io/owner/app:latest" }`.

`preview --web` opens Railway for the project and environment. If the
browser cannot be opened, it prints the link.

## Agent approval flow

Agents should request approval and exit instead of blocking on a prompt:

```bash
railform apply --request-approval --format json
```

The result includes commands for the human to review, approve, or reject the
staged changes. After the human approves, the agent continues with:

```bash
railform apply --approval <approval-id> --wait --format json
```

Railform verifies the staged patch fingerprint before approving and before
continuing the apply. If the Railway staged changes changed after review, the
approval is rejected and the agent must request a new review.

`RAILFORM_DANGEROUSLY_SKIP_PERMISSIONS=1` bypasses `--request-approval` and
applies immediately. Use it only when the user explicitly wants automation to
skip the human handoff.
