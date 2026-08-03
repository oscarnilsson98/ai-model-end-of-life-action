# Releasing the action

Versioned Git tags are the sole source of action release versions, and GitHub Releases
are the release history. `package.json` is intentionally unversioned because this
private package is not published to a package registry. There is no changelog or
package-version field to update.

The repository publishes immutable `vX.Y.Z` releases and maintains a movable `vX`
convenience tag. Publishing a stable GitHub Release starts one workflow that validates
the exact versioned tag before moving the major tag. It never promotes prereleases or
a version older than the current major tag.

## One-time repository setting

[Enable release immutability](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes) in the repository's GitHub settings before publishing. The promotion job deliberately refuses to move the major tag unless the GitHub Release API reports a stable, published, immutable release.

## Prepare the release

1. Merge the intended source and rebuilt `dist/index.js` to the default branch.
2. Confirm CI and CodeQL pass on that commit.
3. Optionally reproduce the release checks locally with the pinned toolchain:

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

The live-feed validation command is intentionally stricter than the shipped action's warning-only mode. It fails when the upstream provider/identifier pair set has changed and prints exact addition/removal counts with bounded previews. Review and classify those pairs, then update the pinned adapter registry, count, and digest before cutting a release. Lifecycle-record conflicts are reported separately.

## Publish

1. Open **Releases → Draft a new release** in GitHub.
2. Create or select a new stable `vX.Y.Z` tag, targeting the intended commit on the
   default branch. Never move or reuse a versioned tag.
3. Choose **Generate release notes**, review the result, and publish the release.
4. Confirm **Validate published release and move major tag** passes and moves `vX`
   to the released commit.

The validation job checks the tag format and target, default-branch ancestry,
immutable external action references, the exact toolchain, locked dependencies,
tests, a reproducible bundle, the live reviewed feed adapter, and a hermetic
packaged-action run. Promotion also requires GitHub to report the release as stable,
published, and immutable.

Validation happens after publication because publication is the only release event.
With release immutability enabled, GitHub has already locked the `vX.Y.Z` tag at that
point. If validation fails, `vX` remains on the previous good release. Rerun the
workflow for a transient failure; for a real defect, fix it and publish the next patch
version because the failed version must not be reused.
