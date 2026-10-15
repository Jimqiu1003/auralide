# ADR-0003 — First-release platform contract

- Status: **Accepted** (platform scope explicitly set by project owner; implementation acceptance pending CI)
- Date: 2026-10-15
- Decider: Project owner (P1.5 mission)
- Extends: [ADR-0001](ADR-0001-foundation.md), [ADR-0002](ADR-0002-p1-runtime-and-core.md)
- Related: [Platform support](../architecture/platform-support.md), Issue #15

## Context

P1 established a Windows-first Electron shell. The owner now requires Windows x64 and macOS
Apple Silicon as the only first-release desktop targets. Architecture selection and a successful
cross-build do not prove that an application starts on the intended hardware.

## Decision

1. Support Windows x64 and macOS ARM64. Windows ARM64 and Linux are future work with no build jobs.
   macOS Intel, Universal Binary, Windows x86 and unspecified targets are excluded.
2. Keep Electron + React + TypeScript and platform-independent Core. Keep platform behavior in main
   process adapters; document changes continue through the existing Core Dispatcher.
3. Use native menu roles and Command accelerators on macOS, Ctrl on Windows. Do not bind native
   Undo/Redo roles to document editing; the future editor must dispatch explicit Core commands.
4. CI must run verification and real Electron smoke on Windows x64 and native ARM64 macOS.
   Check Node and Electron architectures and macOS hardware/Rosetta identity at runtime; fail on
   mismatch. Preserve the required `verify` status as an aggregate of both targets.
5. Source builds and unsigned development startup are the current evidence boundary. Production
   packaging, signing, notarization, distribution and publishing remain deferred.

## Consequences

Both supported operating systems must pass before integration. ARM64 runner availability and desktop
session failures can block the gate and must be reported; they must not become an Intel fallback.
Matching document data does not establish identical font rasterization across operating systems.
Rendering parity requires explicit future font and visual baselines.

This narrows the cross-platform direction in ADR-0001 without changing ADR-0002's security or shared
command contract. Historical unmerged Proposed ADR-0003 on an old P1 branch is not authoritative
(ADR-0002's integration clarification); this accepted platform decision uses the next mainline number.
