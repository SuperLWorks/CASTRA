# CASTRA WebMCP Challenge Edition

**Version 0.1.0-preview.1 · Experimental Preview**

Under active development—not production-ready. This release is for evaluation
and the WebMCP Challenge demonstration. Features, interfaces, and data formats
may change; some controls are demonstrations or placeholders. Do not rely on it
for critical operations or enter sensitive information into the Public Demo.

CASTRA—**Command Agentic System for Tactical Readiness & Automation**—is a
deterministic mission-command workspace where humans retain release, approval,
and lifecycle authority while browser agents can read the same bounded work
projections and prepare reversible proposals through WebMCP.

This repository candidate contains CASTRA's browser-client demonstration. It
retains historical example records and synthetic demo values, not current
Production state. Private evidence bodies, credentials, provider configuration,
server implementations and internal repository history are excluded. See
`DATA-SCOPE.md` for the distinction and the references withheld from this preview.

## Live demonstration

The intended judge URL is <https://castra.superlworks.com/>. Publication of this
repository and the final contest submission remain separate Commander-controlled
steps. Until that gate is executed, this local tree is a release candidate rather
than a public submission artifact.

## Run locally

Requirements: Node.js `>=24.18.0 <25` and npm `11.16.0`.

```sh
npm ci
npm run build
npm run dev
```

Open the URL printed by Vite, choose **Enter Public Demo**, and confirm all three
boundary labels are visible:

- `PUBLIC DEMO · UNAUTHENTICATED`
- `PUBLIC DEMO · NO SAVE`
- `Memory only`

The Public Demo uses bundled synthetic data. Reloading or exiting discards its
in-memory changes. It does not need a login or backend.

## Exercise the WebMCP interface

Use a browser environment that actually exposes the native WebMCP interface.
Normal Chrome or Edge installations do not by themselves prove that capability.
After entering Public Demo, discover the tools registered by the page:

| Tool | Class | Purpose |
| --- | --- | --- |
| `read_command_status` | read-only | Returns the visible authority, roll-up, current gate, and evidence references. |
| `inspect_open_work` | read-only | Filters the open-work projection already visible in the active experience. |
| `draft_session_plan` | proposal-only | Replaces a reversible plan draft held only in the current page. |
| `review_plan` | read-only | Deterministically checks the current page-local plan draft. |
| `prepare_confirmation` | proposal-only | Stages a reversible confirmation draft without closing or approving anything. |

A representative judge path is:

1. call `read_command_status` with `{}`;
2. call `inspect_open_work` with `{ "limit": 5 }`;
3. call `draft_session_plan` with one bounded proposal card whose target exists
   in the synthetic projection;
4. call `review_plan` and confirm the page displays the findings; and
5. verify the page still says Public Demo, unauthenticated, and memory only.

Tool contracts and lifecycle-safe registration are in `src/webmcp/`. The tools
reuse CASTRA's own domain projections and page-local proposal store. They do not
scrape the interface and they expose no direct hosted-state write capability.

## What is new for the challenge

The CASTRA product and deterministic mission records predate the challenge.
Challenge-period work added the WebMCP registration lifecycle, structured
read/proposal contracts, visible agent-activity feedback, the Session Work Plan
draft/review surface, and supported-browser verification. See
`CHALLENGE-SCOPE.md` for the exact chronology and commit boundary.

## Preview capabilities and limitations

- WebMCP supports structured reads, reversible plan drafts, deterministic review,
  and guarded confirmation preparation. Public Demo changes stay in browser memory.
- Configuration Center groups settings and distinguishes draft selections from
  actually applied connections. Selecting a subscription, model, or effort in
  the demo does not launch an agent or connect a paid service.
- Troop Welfare introduces the AI DJ SARGE desktop. External music services and
  activity integrations are unfinished; CRAPS Simulator is a labelled placeholder.
- The full CASTRA name remains in the shared screen shell, with Troop Welfare
  separated at the bottom of the navigation.
- Some layouts and accessibility combinations remain unverified. A known
  Configuration Center agent-card label overlap is deferred for a future update.

Preview status applies even when the demonstration is hosted on the live site.
Hosting availability is not a declaration of production readiness.

## Safety and authority boundary

Public Demo is deliberately synthetic. Its WebMCP tools can read the projection
already rendered in the page and prepare reversible browser-memory drafts. They
cannot write hosted CASTRA state, approve work, allocate records, dispatch agents,
deploy, publish, submit, spend, or access credentials. Those remain explicit
human decisions outside this repository candidate.

## License and attribution

Original work in this repository candidate is offered under the Apache License
2.0; see `LICENSE`. Third-party packages remain under their own licenses; see
`THIRD_PARTY_NOTICES.md` and the inventory-provenance note in `DATA-SCOPE.md`.
The bundled historical artwork is public domain and is
credited in `ATTRIBUTIONS.md` and in the application itself. The Apache license
does not grant trademark rights; see `TRADEMARKS.md`.
