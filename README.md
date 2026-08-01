# AI Model End-of-Life Check

[![CI](https://github.com/oscarnilsson98/ai-model-end-of-life-action/actions/workflows/ci.yml/badge.svg)](https://github.com/oscarnilsson98/ai-model-end-of-life-action/actions/workflows/ci.yml)

A GitHub Action that flags the AI models your code depends on when they approach **end-of-life**, using the community-maintained [deprecations.info](https://deprecations.info) feed (OpenAI, Anthropic, Google, Bedrock, Azure, Cohere, Groq, xAI, …).

It fetches the feed, matches your models by `(model_id, provider)`, and reports any whose `shutdown_date` falls within a configurable window. Findings show up as workflow warnings and a job-summary table; optionally post them to Slack, fail the build, or read the `findings` output and do your own thing (open a ticket, ping a Linear project, …).

## Usage

```yaml
name: AI model EOL check

on:
  schedule:
    - cron: "0 8 * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: oscarnilsson98/ai-model-end-of-life-action@v1
        with:
          models: '[{"id":"gpt-5.2","provider":"openai"},{"id":"claude-sonnet-4-5","provider":"anthropic"}]'
          slack-webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
```

No checkout, no language setup — the action ships a bundled Node 20 entrypoint.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `models` | yes | — | JSON array of models. Objects `[{"id":"gpt-5.2","provider":"openai"}]` or bare ids `["gpt-5.2"]`. Omitting `provider` matches **any** provider (e.g. an Azure-hosted namesake), so pass it when you can. |
| `days-before-shutdown` | no | `90` | Flag a model when its shutdown date is within this many days (or already passed). |
| `fail-on-findings` | no | `false` | Fail the step when at least one model is inside the window. Default is warn-only. |
| `feed-url` | no | `https://deprecations.info/v1/deprecations.json` | Any endpoint serving the deprecations.info JSON schema. |
| `slack-webhook` | no | — | Slack incoming-webhook URL; when set, findings are posted to it. |
| `job-summary` | no | `true` | Write a findings table to the GitHub Actions job summary. |

## Outputs

| Output | Description |
|---|---|
| `has-findings` | `'true'` when at least one model is within the shutdown window. |
| `findings` | JSON array of `{ id, provider, shutdownDate, daysUntilShutdown, replacementModels, url, context }`, soonest shutdown first. `daysUntilShutdown` is negative for a date that already passed. |

## Examples

### Block a PR that introduces a dying model

```yaml
- uses: oscarnilsson98/ai-model-end-of-life-action@v1
  with:
    models: '["gpt-5.2","claude-opus-4-1"]'
    days-before-shutdown: "30"
    fail-on-findings: "true"
```

### Generate the model list from your source of truth

Keeping the list in the workflow drifts. Emit it from wherever your model ids actually live:

```yaml
- uses: actions/checkout@v4
- id: models
  # Assign first so a failing script aborts the step; `echo "$(...)"` would mask it and write an empty list.
  run: |
    list=$(node scripts/list-active-models.mjs)   # prints [{"id":"...","provider":"..."}]
    echo "list=$list" >> "$GITHUB_OUTPUT"
- uses: oscarnilsson98/ai-model-end-of-life-action@v1
  with:
    models: ${{ steps.models.outputs.list }}
```

### Act on the findings yourself

```yaml
- id: eol
  uses: oscarnilsson98/ai-model-end-of-life-action@v1
  with:
    models: '["gpt-5.2"]'
- if: steps.eol.outputs.has-findings == 'true'
  env:
    FINDINGS: ${{ steps.eol.outputs.findings }}
  run: gh issue create --title "AI models approaching EOL" --body "$FINDINGS"
```

## Notes

- **Detection, not a catch-all.** It only sees models the feed tracks with a confirmed `shutdown_date`; a model retired without an announced date won't appear. Matching is exact on `model_id`, so ids carrying a routing prefix (`us.anthropic.claude-…`, `bedrock/…`) won't match the feed's plain id — strip it before passing the list.
- **Provider names are folded**, not fuzzy-matched: `OpenAI` == `openai`, but `Azure` and `Google Vertex` stay distinct from `openai` and `google`, since a namesake on another platform can have a different lifecycle.
- **A broken monitor fails loudly.** If the feed is unreachable or returns a non-array, the action fails rather than reporting a silent all-clear.
- Feed data is community-maintained and best-effort. Treat it as an early warning, not a contract with your provider.

## Development

```bash
bun install
bun run test
bun run typecheck
bun run build   # regenerates the committed dist/index.js
```

`dist/index.js` is bundled and committed — GitHub runs it directly. CI fails if it's out of sync with `src/`, so run `bun run build` before pushing.

Releases move the floating `v1` tag: cut `vX.Y.Z`, then repoint `v1` at it.

## License

[MIT](LICENSE)
