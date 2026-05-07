# Railway Staged Changes Through GraphQL

Railway staged changes are environment-scoped patches. A change is first stored
as an `EnvironmentPatch` with `status: STAGED`, then Railway commits that patch
to the environment. Committing usually triggers deployments for affected
services, unless the commit explicitly skips deploys.

This repo already has a local GraphQL introspection artifact at
`packages/cli/src/graphql-env.d.ts`. It confirms the relevant schema names:

- `Environment.config: EnvironmentConfig`
- `EnvironmentPatch`
- `EnvironmentPatchStatus`: `STAGED`, `APPLYING`, `COMMITTED`
- Query fields: `environmentStagedChanges`, `environmentPatch`,
  `environmentPatches`
- Mutation fields: `environmentStageChanges`, `environmentPatchCommit`,
  `environmentPatchCommitStaged`
- Subscription field: `environmentStagedPatch`

Railway also explicitly allows schema introspection for the public API. If the
local generated schema is stale, introspect
`https://backboard.railway.com/graphql/v2` with an API token and refresh
`packages/cli/src/graphql-env.d.ts`.

Sources:

- Railway staged changes docs:
  https://docs.railway.com/deployments/staged-changes
- Railway public API docs:
  https://docs.railway.com/integrations/api
- Railway environment API examples:
  https://docs.railway.com/integrations/api/manage-environments
- Local schema artifact:
  `packages/cli/src/graphql-env.d.ts`

## Mental Model

The current environment config is the base state. A staged patch is a partial
`EnvironmentConfig` object that overlays that base state.

```text
effective config = environment.config + environmentStagedChanges.patch
```

The patch is keyed by Railway IDs, not service names. For service changes, the
top-level shape is usually:

```json
{
  "services": {
    "<service-id>": {
      "...": "partial service config"
    }
  }
}
```

Shared variables are separate from service variables:

```json
{
  "sharedVariables": {
    "API_URL": { "value": "https://example.com" }
  },
  "services": {
    "<service-id>": {
      "variables": {
        "NODE_ENV": { "value": "production" }
      }
    }
  }
}
```

## Authentication

The public endpoint is:

```text
https://backboard.railway.com/graphql/v2
```

Account, workspace, and OAuth tokens use:

```http
Authorization: Bearer <token>
```

Project tokens are scoped to one project environment and use:

```http
Project-Access-Token: <token>
```

This repo's client currently reads `RAILWAY_API_TOKEN` and sends
`Authorization: Bearer ...` from `packages/cli/src/railway/client.ts`.

## Read Current and Staged Config

Use this before planning a patch. `EnvironmentConfig` is a JSON scalar, so its
exact object shape is discovered from live data and the existing Railway config.

```graphql
query environmentConfig($environmentId: String!) {
  environment(id: $environmentId) {
    id
    name
    config
  }
  environmentStagedChanges(environmentId: $environmentId) {
    id
    status
    message
    patch
    createdAt
    updatedAt
    lastAppliedError
  }
}
```

Railway's official environment API page also documents the minimal staged
changes query:

```graphql
query environmentStagedChanges($environmentId: String!) {
  environmentStagedChanges(environmentId: $environmentId)
}
```

## Stage Changes Without Deploying Yet

Use `environmentStageChanges` when you want to accumulate changes for review or
batch several changes together.

```graphql
mutation stageEnvironmentChanges(
  $environmentId: String!
  $input: EnvironmentConfig!
  $merge: Boolean
) {
  environmentStageChanges(
    environmentId: $environmentId
    input: $input
    merge: $merge
  ) {
    id
    status
    message
    patch
    createdAt
    updatedAt
  }
}
```

Variables:

```json
{
  "environmentId": "env-id",
  "merge": true,
  "input": {
    "services": {
      "service-id": {
        "variables": {
          "API_KEY": { "value": "secret" }
        }
      }
    }
  }
}
```

Use `merge: true` when adding to an existing staged patch. Without merge
semantics, a new staged patch may replace the previous pending patch for that
environment.

## Commit Staged Changes

Committing applies the current staged patch to the environment. By default this
deploys affected services.

```graphql
mutation commitStagedChanges(
  $environmentId: String!
  $commitMessage: String
  $skipDeploys: Boolean
) {
  environmentPatchCommitStaged(
    environmentId: $environmentId
    commitMessage: $commitMessage
    skipDeploys: $skipDeploys
  )
}
```

Variables:

```json
{
  "environmentId": "env-id",
  "commitMessage": "add API_KEY",
  "skipDeploys": false
}
```

The mutation returns a string. Treat it as the workflow ID for the server-side
apply operation.

Set `skipDeploys: true` only when you want the dashboard's "commit without
deploying" behavior. The staged changes docs describe this as the equivalent of
holding `Alt` while clicking Deploy.

## Stage and Commit in One Mutation

For a single change that should be applied immediately, use
`environmentPatchCommit`. It accepts a patch directly and commits it in one
server operation.

```graphql
mutation patchCommit(
  $environmentId: String!
  $patch: EnvironmentConfig
  $commitMessage: String
) {
  environmentPatchCommit(
    environmentId: $environmentId
    patch: $patch
    commitMessage: $commitMessage
  )
}
```

Variables:

```json
{
  "environmentId": "env-id",
  "commitMessage": "set start command",
  "patch": {
    "services": {
      "service-id": {
        "deploy": {
          "startCommand": "bun run start"
        }
      }
    }
  }
}
```

Use this for direct "apply now" flows. Use `environmentStageChanges` plus
`environmentPatchCommitStaged` for review, batching, or "stage only" workflows.

## Example cURL

```bash
curl https://backboard.railway.com/graphql/v2 \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
  --data-binary '{
    "query": "mutation Commit($environmentId: String!, $message: String) { environmentPatchCommitStaged(environmentId: $environmentId, commitMessage: $message) }",
    "variables": {
      "environmentId": "env-id",
      "message": "apply staged config"
    }
  }'
```

## Operational Notes

- Staged changes are scoped to one environment.
- The dashboard shows staged changes in a banner and highlights pending changes.
- "Deploy" commits all staged changes at once and redeploys affected services.
- "Commit without deploying" is represented by `skipDeploys: true`.
- Networking changes are not staged yet and are applied immediately.
- Adding databases or templates affects only the current environment and may not
  create a commit in project history.
- If `environmentPatchCommitStaged` returns an error like "No patch to apply",
  read `environmentStagedChanges` first and confirm there is a staged patch.
- Keep commit messages short because they appear in Railway activity/history.

## Suggested Implementation Flow for Railform

1. Resolve project, environment, and service IDs before producing a patch.
2. Query `environment.config` and `environmentStagedChanges`.
3. Build a minimal `EnvironmentConfig` patch keyed by service IDs.
4. Call `environmentStageChanges` to write Railway's staged patch.
5. Read `environmentStagedChanges` and render that patch as Railform's plan.
6. If the user applies the plan, call `environmentPatchCommitStaged`.
7. After committing, query the environment or workflow/deployments to verify the
   result.

## Railform Plan/Stage/Apply Design

Use Railway staged changes as Railform's primary plan artifact. Railform should
avoid building a full local diff engine while Railway already has an
environment-scoped staged patch model that the dashboard understands.

The important caveat is naming: Railway staging writes state to the target
environment, so `railform plan` would not be a pure dry run. That is acceptable
if Railform is explicit that a plan is a remote staged patch. A good command
split is:

```text
railform plan       # create/update Railway staged changes, deploy nothing
railform show       # read and render the current Railway staged patch
railform apply      # commit the current staged patch
```

In this model, `plan` is effectively `stage + show`. It should:

1. Resolve project, environment, and service names to Railway IDs.
2. Generate the minimal `EnvironmentConfig` patch Railform wants.
3. Read `environmentStagedChanges` before writing.
4. Call `environmentStageChanges` to create/update Railway's staged patch.
5. Read `environmentStagedChanges` again.
6. Render Railway's staged patch as the plan output.

Railform still needs a small amount of comparison logic, but only for guardrails,
not for user-facing diff ownership:

- detect whether an existing staged patch is present before writing
- detect whether the staged patch changed between `plan` and `apply`
- print which services/variables/config keys are touched by the staged patch
- warn for changes Railway does not stage, such as networking

This is much smaller than a Terraform-style diff. Railform can render the staged
patch structurally instead of trying to reconstruct every before/after value.

If there is already a staged patch, `plan` should fail by default unless the
existing staged patch is clearly from Railform and matches the current target.
Require an explicit flag for the two ambiguous cases:

```text
railform plan --merge       # merge generated patch into existing staged patch
railform plan --replace     # replace existing staged patch with generated patch
```

`show` should be read-only and should print the current Railway staged patch for
an environment. This gives users a way to inspect dashboard-created changes too:

```text
railform show --environment production
```

`apply` should commit the current staged patch by default:

```text
railform apply
```

It should read `environmentStagedChanges`, render a final summary, verify the
fingerprint if one was recorded by `plan`, then call
`environmentPatchCommitStaged`.

For one-shot usage, expose a convenience flag:

```text
railform apply --auto-approve
```

That can run `plan` and immediately commit the resulting staged patch in one
command. Internally, prefer `environmentStageChanges` followed by
`environmentPatchCommitStaged` so the same Railway staged patch is observable in
all apply paths.

Expose Railway's commit-without-deploy behavior as:

```text
railform apply --skip-deploys
```

by passing `skipDeploys: true` to `environmentPatchCommitStaged`.

### Plan Identity

Railway staged patches do not give Railform a dedicated metadata field. Treat
the staged patch itself as the source of truth and compute a stable local
fingerprint:

```text
fingerprint = sha256(stableJson(patch))
```

Show the fingerprint in CLI output and include it in staged/commit messages:

```text
railform: update Notus API (sha256:abc123)
```

Before `apply`, read `environmentStagedChanges` again, recompute the
fingerprint, and verify it matches the fingerprint printed by `plan` or the one
embedded in the staged message. If it does not match, stop and ask for a new
plan.

### Environment Forks

Forking an environment per apply is useful, but it should be an opt-in sandbox
flow, not the default apply path.

The local schema exposes `EnvironmentCreateInput` with `sourceEnvironmentId`,
`ephemeral`, `skipInitialDeploys`, and `stageInitialChanges`, so Railform can
create a temporary environment from the target:

```graphql
mutation createApplyPreview($input: EnvironmentCreateInput!) {
  environmentCreate(input: $input) {
    id
    name
    isEphemeral
    sourceEnvironment {
      id
      name
    }
  }
}
```

Suggested command:

```text
railform preview --environment production
```

Preview flow:

1. Create an ephemeral environment from the target environment with
   `sourceEnvironmentId`.
2. Apply or stage the generated patch to the preview environment.
3. Optionally deploy affected services there.
4. Report the preview environment ID and service URLs.
5. Leave cleanup explicit at first:
   `railform preview delete <environment-id>`.

This catches deploy/runtime breakage before touching production staged changes,
but it costs more API operations, can create extra deployments, and may interact
badly with production-only integrations, domains, and databases. It is better as
`preview` than as the default `apply`.

### Recommended Initial Implementation

Implement this in layers:

1. Add Railway queries/mutations for environment config, staged changes, stage,
   and commit staged.
2. Extend config resolution so projects, environments, and services resolve to
   Railway IDs before planning.
3. Add `show` as a read-only renderer for `environmentStagedChanges`.
4. Add `plan` as a remote staged-change writer using `environmentStageChanges`,
   followed by the same renderer as `show`.
5. Change `apply` to commit `environmentPatchCommitStaged` by default.
6. Add preview environment forks after the base plan/stage/apply loop is stable.
