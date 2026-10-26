# ADR 0016 - Repository, Quality Gate and Branch Protection

Status: Proposed (assumed by the implementing agent on 2026-10-23; awaiting product review)

## Decision

- The code lives in the public GitHub repository `CMaintz/polaris`. It is public because, on
  the current GitHub plan, branch protection is only available for public repositories.
- Foundry v2.13.0 provides the gate: `mise run gate` locally, and the `gate`, `security`,
  `ratchet` and `bootstrap` workflows in CI.
- `main` requires the `gate / gate-ok` and `security / security-ok` checks and a linear history.
  It does not require an approving review, because the project has one maintainer, who cannot
  approve their own pull requests. Add a required review once there is a second maintainer.
- `mise.toml` pins `FOUNDRY_SCRIPTS_REF` to v2.13.0, matching Foundry main. The v2.13.0 `ts`
  template still says v2.12.0, which has no `codemap-check`.
