# Autonomous Notification Payload Contract

Channel-agnostic payload for the headless mid-build question mechanism
(REQ-024–REQ-028). Used when `/build --auto` hits a decision outside the
spec's assumption-authorization list and must surface a question without a
human necessarily present in the session.

## Schema

```json
{
  "pr_url": "string",
  "comment_url": "string",
  "summary": "string (one line)",
  "channel": "push | pr-comment-only | pluggable"
}
```

- `pr_url` — the (draft) PR already open for this `--auto` run.
- `comment_url` — direct link to the specific PR comment holding the
  question (options, pros/cons, recommendation, supporting visuals per
  REQ-025).
- `summary` — one-line description of what's being asked, for display in a
  notification that can't show the full comment body.
- `channel` — which delivery mechanism produced/will produce this
  notification. Anticipates future values (e.g. `slack`, `email`) without
  requiring a schema change to add them later.

## Implemented channels (this round)

Only two of the anticipated `channel` values are implemented:

- **`push`** — a native push notification (the `PushNotification` tool),
  used when the `--auto` run is happening inside a live interactive
  session. The user gets an immediate, out-of-band nudge that a question is
  waiting, without needing to poll the PR.
- **`pr-comment-only`** — the headless fallback, used when no interactive
  session is available to receive a push notification (e.g. a
  fully-unattended trigger). The question is still posted as a PR comment
  (REQ-026); this channel value means *no additional* notification is sent
  beyond that comment — discovery relies on the PR comment itself or a
  follow-up `--auto` pass picking it up.

`pluggable` is a reserved value for future channels (Slack, email, etc.)
that are not wired up in this round. Selecting a channel value that isn't
`push` or `pr-comment-only` is not yet a supported code path — the schema
exists so those channels can be added without another payload-shape change.

## Flow

1. `/build --auto` composes the question as a rich PR comment (REQ-025) and
   posts it (REQ-026), obtaining `comment_url`.
2. It builds this payload (`pr_url`, `comment_url`, `summary`, `channel`).
3. If a live interactive session initiated the run, `channel: "push"` and
   the payload is sent via the `PushNotification` tool. Otherwise,
   `channel: "pr-comment-only"` and no additional delivery happens beyond
   the comment already posted in step 1.
4. The run continues any other independent work (REQ-024) or pauses,
   resuming once the PR-comment reply is picked up by a follow-up `--auto`
   pass or the original session if still live (REQ-028).
