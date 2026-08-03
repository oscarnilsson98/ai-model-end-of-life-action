# Releasing the action

This repository publishes immutable `vX.Y.Z` releases and a movable `vX` convenience tag. The release workflow validates the exact versioned tag before it moves the major tag; it never promotes prereleases or a version older than the current major tag.

## One-time repository setting

[Enable release immutability](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes) in the repository's GitHub settings before publishing. The promotion job deliberately refuses to move the major tag unless the GitHub Release API reports a stable, published, immutable release.

## Prepare the release commit

1. Set the exact stable version in `package.json` without a `v` prefix.
2. Install and verify with the pinned toolchain:

   ```bash
   npx --yes bun@1.3.14 install --frozen-lockfile --ignore-scripts
   npx --yes bun@1.3.14 run check
   npx --yes bun@1.3.14 x tsc --project .github/tsconfig.json
   npx --yes bun@1.3.14 .github/scripts/check-action-pins.ts
   npx --yes bun@1.3.14 .github/scripts/assert-live-feed.ts
   npx --yes bun@1.3.14 run build
   git diff --exit-code -- dist/index.js
   git diff --check
   ```

3. Commit the rebuilt `dist/index.js` with the source and version change.
4. Merge the exact release commit to the repository's default branch and confirm CI and CodeQL pass on that commit.

The live-feed validation command is intentionally stricter than the shipped action's warning-only mode. It fails when the upstream provider/identifier pair set has changed and prints exact addition/removal counts with bounded previews. Review and classify those pairs, then update the pinned adapter registry, count, and digest before cutting a release. Lifecycle-record conflicts are reported separately.

## Publish

1. Create and push a stable tag whose version exactly matches `package.json`, for example `v3.0.0`. Never move or reuse a versioned tag.
2. Wait for the tag-triggered **Validate release and move major tag** run to pass. A tag push validates but does not promote the movable major tag.
3. Publish a stable GitHub Release for that existing tag. With release immutability enabled, publication locks the versioned tag.
4. Confirm the release-triggered workflow validates the same tag and moves `v3` to its commit.

The validation job checks default-branch ancestry, the package/tag version match, immutable external action references, the exact toolchain, locked dependencies, tests, a reproducible bundle, the live reviewed feed adapter, and a hermetic packaged-action run. The packaged run explicitly scans the validated release commit rather than the workflow-dispatch commit.

`workflow_dispatch` is a recovery path for an existing versioned tag. Set `promote: false` to validate only. Promotion still requires an immutable published release and all normal validation checks.
