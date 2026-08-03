# Security policy

## Supported versions

Security fixes are released on the current `v3` line. Older major versions and individual historical releases do not receive backports.

| Version | Supported |
| --- | --- |
| `v3` | Yes |
| `< v3` | No |

## Reporting a vulnerability

Please report suspected vulnerabilities through [GitHub private vulnerability reporting](https://github.com/oscarnilsson98/ai-model-end-of-life-action/security/advisories/new). If GitHub says private reporting is unavailable, open a minimal public issue requesting a private security contact, without including vulnerability details, proof-of-concept code, secrets, or affected-user data.

Include the affected action version or commit, a minimal reproduction, the expected impact, and any known mitigations. Please avoid including real webhook URLs, tokens, or other secrets in the report.

The maintainer will acknowledge the report as soon as practical and coordinate validation, remediation, and disclosure through the private advisory. Response and release timing depends on severity and the complexity of a safe fix.

## Secure use of the action

For the strongest supply-chain guarantee, pin this action to a full release commit SHA and use Dependabot to keep that pin current. Moving major tags such as `v3` are convenient, but they are intentionally mutable. Grant the workflow only `contents: read`, use an unprivileged `pull_request` checkout with full history, and store an optional Slack webhook as a GitHub Actions secret rather than directly in workflow YAML. V3 does not execute repository code; it reads the selected commit through Git object APIs.
