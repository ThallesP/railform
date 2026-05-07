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

1. Discover the shape of the project with `railform --help` and
   `railform plan`.
2. Edit `railform.config.ts` until the plan matches the intended Railway stack.
3. Request human review with `railform apply --request-approval --format json`.
4. Tell the human to run the returned `railform review` and `railform approve`
   commands.
5. Continue with `railform apply --approval <approval-id> --wait --format json`.
6. If apply reports a service, deploy, image, or configuration failure, surface
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
