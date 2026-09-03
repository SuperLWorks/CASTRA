# WebMCP Challenge scope

CASTRA—**Command Agentic System for Tactical Readiness & Automation**—predates
the WebMCP Challenge. The contest contribution is the WebMCP interaction layer
and the human-visible workflow it enables.

## Pre-existing baseline

- Baseline commit: `4e94da7ebaa3ef488ec65e4f34b300b7d201d394`
- Commit time: `2026-08-16T12:34:44-05:00`
- Existing work: the CASTRA application, synthetic Public Demo, mission records,
  lifecycle boundaries, and human Commander gates.

## Challenge-period WebMCP work

The WebMCP work began after the challenge start and was developed in the M017
line, then refined for the M016 submission candidate:

| Commit | Time (`America/Chicago`) | Contribution |
| --- | --- | --- |
| `f38eaf646c4680b720a841eec26dcd12d1ce811c` | `2026-08-28T08:14:46-05:00` | WebMCP foundation checkpoint |
| `0e829f06ac8ebd823925a48e28d920950c231226` | `2026-08-28T09:51:59-05:00` | Lifecycle-safe WebMCP correction verified |
| `4c4a13fa9c3ed83bbb432558a4426724d712bf68` | `2026-08-28T12:03:05-05:00` | Proposal-tool core |
| `0b801647d2593bda77c9b18e4b115e80227a5c4e` | `2026-08-28T12:58:28-05:00` | Shared plan target index |
| `033447d421381cc97e3c2e3128c1abe8043bcd89` | `2026-08-29T11:05:17-05:00` | Visible WebMCP proposal review |
| `de412bad459d182bc502a80df3b5b94b5b12f878` | `2026-09-01T22:07:33-05:00` | Visible native WebMCP activity for the submission capture |

The challenge-period implementation includes:

- five page-registered WebMCP tools with JSON-schema inputs;
- mode-aware registration and unregistration across welcome, Public Demo,
  authenticated, and review experiences;
- read-only command status and open-work projections;
- reversible, page-local Session Work Plan and confirmation drafts;
- deterministic plan review with visible findings; and
- visible WebMCP activity states tied to actual tool execution.

## Final preview integration

The final integrated browser source is
`be0ce7059644e222dc4cf04b43682841b2fdd1ac`, incorporating the September 2–3
Configuration Center and Troop Welfare work, the persistent expanded CASTRA
name, and separate lower Troop Welfare navigation. These are supporting
challenge-period application changes, not five new WebMCP tools or completed
provider integrations.

The public package is version `0.1.0-preview.1`, an experimental preview. Its
public-only exclusions and reference substitutions are disclosed in
`DATA-SCOPE.md`. Internal commit identifiers document development chronology;
the private development history is not part of the public repository.
`SOURCE-MANIFEST.json` binds the final exported files when the candidate is
frozen. Local preparation alone is not publication or submission.
