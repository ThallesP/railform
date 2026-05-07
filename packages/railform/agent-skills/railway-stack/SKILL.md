---
name: railform-railway-stack
description: Deploy, preview, approve, and troubleshoot Railway infrastructure through Railform. Use this whenever the user mentions Railform, railform.config.ts, railform plan/apply, agent-safe Railway changes, approval handoffs, or Railway services/databases managed declaratively.
---

# Railform Railway Stack

Start here when creating, previewing, deploying, modifying, or troubleshooting
Railway infrastructure through Railform.

## Load Only What You Need

- Read [railform.md](railform.md) for command examples, config APIs, and common
  gotchas.
- Keep all infrastructure changes in `railform.config.ts` or in Railform itself.
- If Railform is missing a capability needed for the deployment, improve
  Railform instead of reaching for another infrastructure tool.

## Default Agent Flow

1. Discover the application before writing config: package manager, start
   command, required env vars, health route, database usage, git source, and
   whether it serves HTTP.
2. Run `railform --help`, then `railform plan`. If config loading fails because
   `@railform/core` is missing, install it with the project package manager and
   rerun `railform plan`.
3. Edit `railform.config.ts` until the plan matches the intended Railway stack.
   Infer app service `source.repo` from `git remote -v` and `source.branch` from
   the current branch when the repo is GitHub-backed.
4. For HTTP services with a health check, ask or default to a public domain. If
   Railform cannot declare that domain yet, say so explicitly before apply.
5. Request human review with `railform apply --request-approval --format json`.
6. Tell the human to run the returned `railform review` and `railform approve`
   commands.
7. Continue with `railform apply --approval <approval-id> --wait --format json`.
8. Treat `status: applied` as config commit success, not deployment completion.
   Verify Railway deploy health, domain availability, or a successful HTTP
   health check before calling the deployment complete.
9. If apply reports a service, deploy, image, or configuration failure, surface
   that exact failure to the user and update the config or Railform code before
   trying again.

## Agent Safety

- Do not run plain `railform apply` unless the user explicitly asked for direct
  mutation.
- Do not wait on prompts. Pass prompt values with `--var SERVICE.KEY=value` or
  `--var KEY=value`.
- Use `randomSecret(length)` for generated secrets and ask the human only for
  external secrets that Railform cannot generate.
- Use `RAILFORM_DANGEROUSLY_SKIP_PERMISSIONS=1` only when the user explicitly
  asks to bypass the approval handoff.
- Report failures with concrete resource names, approval IDs, deployment IDs,
  statuses, and relevant error text.
- In recording or demo contexts, do not relay workspace-list output. Prefer an
  existing `RAILWAY_WORKSPACE_ID`, saved `.railform/state.json`, or a
  user-provided workspace name; if a command enumerates workspaces anyway,
  summarize only the selected workspace.
- Remove generated placeholder variables like `API_TOKEN`, `SESSION_SECRET`, or
  `INTERNAL_API_URL` unless the inspected app actually needs them.
