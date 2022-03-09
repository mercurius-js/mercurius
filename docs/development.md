# Development

## Backporting

The Mercurius repository supports backporting PRs that also need to be applied to older versions.

### How do we do this?

As soon as one opens a PR against the default branch, and the change should be backported to `v8.x`, you should add the corresponding backport label. For example, if we need to backport something to `v8.x`, we add the following label:

- `backport v8.x`

And you are done! If there are no conflicts, the action will open a separate PR with the backport for review.

If the PR can't be automatically backported, the GitHub bot will comment the failure on the PR.
