# Engine Console Diagnostics Implementation Plan

**Goal:** Make the existing engine console useful for configuration and recent-run diagnosis without claiming live model health from configuration.

**Architecture:** Preserve the incumbent theme and APIs. Extract the growing Engine page into configuration, gateway, tools, and diagnostics components. Keep configured engines and the local model selection distinct from observed runs. Gateway plugins remain explicitly sidecar-only. No backend routing changes or model calls.

**Decision:** Extend the existing page rather than introduce a separate dashboard or a new diagnostics backend. This keeps configuration actions in one place and avoids duplicating execution state.

**Tech Stack:** React, SWR, UnoCSS, Lucide, Node test runner.

- [ ] Add failing source contracts for diagnostics, search, honest unknown/error state, and guarded configuration actions. Update existing contracts to follow extracted components.
- [ ] Implement EnginePairPanel, EngineGatewayPanels, EngineTools, EngineRunDiagnostics, and the orchestrating Engine page. Render counts only from successful requests; preserve cached data with a stale warning. Refresh all four resources together.
- [ ] Verify failure filtering, return-to-session navigation, search, loading/error states, and long-text wrapping in desktop and mobile browser checks. Use local fixtures for mutation tests, never live model calls.
- [ ] Run all Node tests, TypeScript, build, and Impeccable detect. Inspect diff, commit source and generated dist, merge locally, and confirm the running service serves the new engine chunk without restarting it.

## Acceptance

- Recent failures are limited to the overview's returned window, not presented as lifetime failures or current health.
- Stopped runs are not failures. No-data and API failure never become a green healthy badge or a misleading zero count.
- Configuration changes retain server persistence and disabled guards; errors are inline. No automatic retry of a failed task.
- Existing plugin presets, protected core plugins, terminal, capabilities, and engine catalog remain reachable.
- No unrelated chat observation changes. Existing memory-write counting and chat completion behavior require their own follow-up audit.
