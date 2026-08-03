# V3 schemas

These Draft 2020-12 schemas are the published structural contracts for v3:

- [`policy.schema.json`](policy.schema.json) validates the JSON value produced from `.github/ai-model-lifecycle.yml` after YAML Core-schema decoding.
- [`usage-evidence.schema.json`](usage-evidence.schema.json) validates checked-in runtime observations, deployment snapshots, and generated declarations.
- [`lifecycle-feed.schema.json`](lifecycle-feed.schema.json) validates the typed lifecycle-feed producer envelope.
- [`assessment-report.schema.json`](assessment-report.schema.json) validates the complete local JSON assessment report.

Every contract object rejects unknown properties. Parser-defined limits for strings, arrays, integers, and document versions are represented where Draft 2020-12 can express them.

The runtime remains authoritative for relational and transport constraints that portable JSON Schema cannot express: byte-size and UTF-8 limits, chronological ordering, equality between a source environment and its records, uniqueness by a particular ID property, feed supersession graph validity, lifecycle dates relative to `generatedAt`, and report cross-field invariants. These checks fail closed; they are not weakened by the structural schemas.
