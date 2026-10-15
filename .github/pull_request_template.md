## What and why

<!-- One or two sentences: the change and the reason it is needed. -->

## Task record

- Task id / title:
- Owner:
- Branch:
- Related issue / ADR:

## Changes

<!-- Key files and the behaviour they change. Mention shared config explicitly. -->

## Verification

Commands executed and their observed results (do not write "should pass"):

```
pnpm verify     →
```

- [ ] `pnpm verify` passes locally (format:check, lint, typecheck, test, build)
- [ ] New behaviour is covered by a test, or the reason it is not is stated below

## Safety checklist

- [ ] No secrets, tokens, `.env` files or private keys are included
- [ ] No dependency added without a stated reason and a license check
- [ ] No architecture decision changed silently (ADR updated if it changed)
- [ ] No files outside this task's declared write scope are touched

## Not verified / risks

<!-- Anything unverified, assumed, or intentionally deferred. Write "none" if genuinely none. -->
