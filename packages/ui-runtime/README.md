# @deepseek-ai/dsh-client-ui-runtime

English | [中文](README.zh.md)

Browser surface for `dsh-insider`. The Client Cordis plugin registers one `sidebar.footer` action and one `shell.overlay`. Opening the action reveals a full-height explorer beside the current sidebar; closing it returns to the existing DSH surface without adding a floating assistant button or replacing the session UI. The header shows the exact current profile supplied by the Host snapshot.

The Runtime Graph tab renders the Host snapshot as a deterministic provider-to-consumer dependency graph. Its overview cards and filter use four stable product-facing states: PENDING, ACTIVE, DISPOSED, and FAILED. Detailed Loader phases collapse into those states. The default canvas keeps plugins and services primary; selecting a plugin or filtering by Fiber status expands the relevant Fiber instances, ownership, parent-Fiber, and missing-injection relationships on demand. Search also covers Fiber uid, name, and module. A Fiber status card enters Fiber mode, so a pending child remains locatable even when its owner plugin is active. Bounded zoom controls scale the canvas and reset its viewport. Dragging blank canvas pans the complete graph without stealing node clicks; the focused viewport also retains native keyboard scrolling. Selecting a node focuses the canvas on its complete relationship neighborhood and opens a metadata inspector; closing the inspector restores the complete graph.

The Overview tab includes a compact Plugin Activity table over the Host's bounded Effect lifecycle window. Each row puts Current, Delta, Churn, and a current-count sparkline together so stable ownership, high turnover, and sustained growth remain distinguishable. Selecting a row opens Created, Disposed, Net, Churn, a larger trend, and recent privacy-safe Effect labels. The UI marks an overflowed window as incomplete instead of presenting partial changes as complete history.

The Request Trace tab first groups the Host's bounded metadata window into Session-owned Agent Turns. Selecting a Turn opens its chronological user, Agent loop, LLM, tool, and session lanes; selecting one event then shows only its correlation fields. Events without a Turn remain counted as Session-level events rather than being assigned a synthetic Turn. An incomplete status marks a retained Turn whose start event has already fallen outside the bounded window. The copy explicitly states that prompt text, model output, tool arguments, and tool result content are absent. One shared observable Remote source performs single-flight refreshes and polls only while the overlay is visible, using the interval returned by the Host.

The package uses the existing locale, runtime, sidebar, layout, slot, and ui-primitives contracts. Its public registration happens through Cordis effects, so unloading the Client plugin removes the action, overlay, locale contribution, source, and store together.

## Model Experience

None, as this browser-only diagnostic surface visualizes metadata and registers nothing model-facing.

#### KV Cache effect

None; it neither reads nor changes model input.

## Known Limitations and Deferred Work

- The graph uses a deterministic column layout and does not persist its zoom or viewport between overlay openings.
- The browser polls point-in-time snapshots rather than subscribing to a Host push stream.
- Trace history is limited to the current Host process and its configured retention window.
- Effect activity begins when the Host plugin activates, is process-local, and excludes Effects that cannot be attributed to a Loader entry.
- The surface is read-only and does not expose plugin lifecycle controls.
