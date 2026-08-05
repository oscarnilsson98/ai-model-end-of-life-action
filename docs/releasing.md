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

The live-feed validation command asserts that the upstream source still parses, still covers every registered platform, and still yields active lifecycle data. It does not gate on the source's pair set changing: upstream adds, renames and withdraws rows freely, and none of that is release work. Its report line is informational — record and pair counts, lifecycle conflicts, pairs on platforms not registered yet, and any rows skipped for an unusable provider label. A rising unregistered-platform count is the cue to consider registering that platform for blocking authority, not a release blocker.

## Publish

1. Open **Releases → Draft a new release** in GitHub.
2. Create or select a new stable `vX.Y.Z` tag, targeting the intended commit on the
   default branch. Never move or reuse a versioned tag.
3. Choose **Generate release notes**, review the result, and publish the release.
4. Confirm **Validate published release and move major tag** passes and moves `vX`
   to the released commit.

The validation job checks the tag format and target, default-branch ancestry,
immutable external action references, the exact toolchain, locked dependencies,
tests, a reproducible bundle, the live feed adapter, and a hermetic
packaged-action run. Promotion also requires GitHub to report the release as stable,
published, and immutable.

Validation happens after publication because publication is the only release event.
With release immutability enabled, GitHub has already locked the `vX.Y.Z` tag at that
point. If validation fails, `vX` remains on the previous good release. Rerun the
workflow for a transient failure; for a real defect, fix it and publish the next patch
version because the failed version must not be reused.

## Scheduled contract monitoring

The **Upstream feed contract** workflow runs daily and is the only place drift outside
this repository becomes visible. Nothing it observes fails a consumer's run, by design:
the adapter ignores upstream fields it does not read, quarantines malformed rows, and
falls back to lexical evidence when a semantic rule no longer matches. That tolerance is
what makes an explicit monitor necessary — without it, drift is silent.

The job opens one issue titled `Upstream contract drift detected`, commenting on the
existing issue rather than filing duplicates while drift is unreviewed. It reports:

- **Upstream feed drift** — fields or serving platforms the source has started or stopped
  publishing, compared against `.github/upstream-contract-baseline.json`. Review the
  change, then update that baseline in the same commit. A new field may be worth reading;
  a withdrawn platform may mean the source stopped covering something.
- **Detector qualification major drift** — a provider SDK whose *major* version moved past
  the version its rules were qualified against, from `DETECTOR_QUALIFICATION`. Within-major
  updates are logged but never reported, because a patch release rarely reshapes a call
  surface and a daily stream of them would train maintainers to ignore the job.

Re-qualifying means checking the new major's model-selector call shapes against the
published rules, updating `DETECTOR_QUALIFICATION`, and adding cases to
`test/detection/detectors.test.ts` for anything that changed.
