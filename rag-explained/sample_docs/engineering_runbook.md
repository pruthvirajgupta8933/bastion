# Acme Corp — Engineering Runbook

## Deploying to Production
Production deploys run through the CI pipeline on the `main` branch. A deploy
is triggered by tagging a release with `git tag vX.Y.Z && git push --tags`.
The pipeline runs tests, builds the container image, and performs a rolling
update across the Kubernetes cluster. Never deploy manually with `kubectl` —
always go through the pipeline so the change is auditable.

## Rolling Back a Bad Deploy
To roll back, re-tag the previous known-good release or run
`kubectl rollout undo deployment/api`. Notify the on-call engineer in the
`#incidents` channel before rolling back so nobody deploys on top of you.

## On-Call Rotation
On-call rotates weekly and is tracked in PagerDuty. The on-call engineer is
responsible for acknowledging alerts within 15 minutes and for writing a
short incident summary afterwards.

## Database Migrations
Migrations are applied automatically during deploy via the `migrate` job.
Migrations must be backward compatible — never drop a column in the same
release that stops writing to it. Split destructive changes across two deploys.

## Secrets Management
Secrets live in the vault, never in the repo or environment files committed to
git. Access is granted per-service via short-lived tokens. Rotate any secret
that may have been exposed immediately and notify the security team.
