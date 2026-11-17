# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `rubenspeculis/mcp-apps`.
Use the `gh` CLI from this checkout.

## Conventions

- Create: `gh issue create --title "..." --body "..."`.
  Use a heredoc for multi-line bodies.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels,comments`.
  Add appropriate label and state filters.
- Comment: `gh issue comment <number> --body "..."`.
- Labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: post the explanation as a separate comment, then
  `gh issue close <number>`. On an already-closed issue,
  `gh issue close --comment` drops the comment and still exits 0.

Before the first issue creation in a session, check
`gh repo view --json nameWithOwner`. File into `rubenspeculis/mcp-apps`;
confirm with the user if the resolved target differs.

## Parent issues and blockers

- Sub-issues (`gh` 2.94+): `gh issue create --parent <parent> ...`,
  or `gh issue edit <parent> --add-sub-issue <child>`.
- Older CLI: POST to `repos/rubenspeculis/mcp-apps/issues/<parent>/sub_issues`
  using `gh api --method POST` with `-F sub_issue_id=<child-db-id>`.
  If unavailable, use a task list in the parent and `Part of #<parent>`
  at the top of the child.
- Native blockers (`gh` 2.94+):
  `gh issue edit <child> --add-blocked-by <blocker>`.
- Older CLI: POST to
  `repos/rubenspeculis/mcp-apps/issues/<child>/dependencies/blocked_by`
  with `-F issue_id=<blocker-db-id>`.
- Get a database ID with
  `gh api repos/rubenspeculis/mcp-apps/issues/<number> --jq .id`.
  Use this numeric ID, not an issue number or node ID, in those API bodies.
- Where dependencies are unavailable, put `Blocked by: #<n>, #<n>`
  at the top of the child.
- Count open native blockers:
  `gh api repos/rubenspeculis/mcp-apps/issues/<number> --jq .issue_dependencies_summary.blocked_by`.
  A ticket is unblocked when every blocker is closed.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Skill operations

- "Publish to the issue tracker": create a GitHub issue.
- "Fetch the relevant ticket": read the GitHub issue.

## Wayfinding operations

- Map: one issue labelled `wayfinder:map`, containing
  Notes / Decisions-so-far / Fog.
- Child: link a sub-issue to the map using the conventions above.
  Label it `wayfinder:<type>` (`research`, `prototype`, `grilling`, `task`).
- Frontier: inspect the map's open children; exclude tickets with an
  open blocker or an assignee. First in map order wins.
- Claim: `gh issue edit <number> --add-assignee @me`,
  the session's first write.
- Resolve: comment with the answer, close the child, then append a
  gist and link to the map's Decisions-so-far.
