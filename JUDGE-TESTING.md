# Judge testing guide

**Version 0.1.0-preview.1 · Experimental Preview — not production-ready.**

Evaluate the bounded synthetic demonstration, not a finished production product.
Configuration selections do not connect providers or launch agents. Known layout
limitations do not represent completed accessibility or cross-browser verification.

## Fast path

1. Open <https://castra.superlworks.com/> in ChatGPT's in-app browser or a
   supported Chrome/Edge WebMCP environment.
2. If the page opens an authenticated session, use a fresh unauthenticated
   browser profile. Do not test with production data.
3. Select **Enter Public Demo**.
4. Confirm the page visibly says **Public Demo**, **Unauthenticated**, **No Save**,
   and **Memory only**.
5. Ask the browser agent to read CASTRA's command status and inspect up to five
   open-work entries using the page's WebMCP tools.
6. Ask it to draft one bounded Session Work Plan card against an exact target
   present in the synthetic projection, then run the plan review.
7. Open **Session Board** and confirm the draft, review findings, and protected
   human gate are visible.

## Expected result

- `read_command_status` and `inspect_open_work` return structured synthetic data.
- `draft_session_plan` creates only a browser-memory draft.
- `review_plan` returns deterministic pass, attention, or blocking findings.
- the visible interface reflects actual WebMCP activity.
- no login, provider, credential, production record, or hosted write is needed.
- reload or **Exit Demo** discards the draft.

## Local fallback

Run `npm ci`, `npm run build`, and `npm run dev`, then repeat the same path at the
local Vite URL. The source candidate has no server-side dependency for Public
Demo operation.

## Supported-boundary note

WebMCP support is a browser capability. A normal browser without the WebMCP API
can still use the visual Public Demo, but it cannot discover the registered
tools. That is an environment limitation, not a substitute for the WebMCP test.
