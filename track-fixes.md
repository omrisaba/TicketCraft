# TicketCraft Confirmed Fixes Log

This log contains only bugs that were confirmed directly from code behavior and fixed.

## 1) Usage events could silently fail and disappear

- **Category:** Data loss / reliability
- **Why this was a bug:**
  1. Login/improve/sync usage events are critical for the Usage Dashboard.
  2. `usageTracker.record()` had a single write attempt and no durability check.
  3. Callers swallowed all write errors (`try/catch {}`), so failures were invisible.
  4. Result: users can log in successfully while never appearing in unique users.
- **Fix implemented:**
  - `record()` is now async with retries and read-back verification.
  - Call sites now use `.catch(...)` warnings instead of silent swallowing.
  - Added interval timer `unref()` so background pruning does not hold process exit.

## 2) `/api/export/pdf` pretended to export PDF but returned Markdown bytes

- **Category:** Logic / API contract break
- **Why this was a bug:**
  1. Endpoint name and route contract imply PDF bytes.
  2. Controller was returning Markdown content type and `.md` filename.
  3. Clients expecting PDF would get wrong format silently.
- **Fix implemented:**
  - `exportPdf` now returns explicit `501 PDF_NOT_IMPLEMENTED` with a clear message.

## 3) API client assumed all responses are JSON

- **Category:** Data parsing failure
- **Why this was a bug:**
  1. `request()` always called `response.json()`.
  2. Markdown export endpoint returns `text/markdown`, not JSON envelope.
  3. Export flow failed due to JSON parse error despite successful server response.
- **Fix implemented:**
  - `request()` now branches by content type:
    - JSON -> existing envelope handling
    - `text/*` -> `response.text()`
    - `application/pdf` -> `response.arrayBuffer()`

## 4) GitLab subgroup repository URLs were parsed incorrectly

- **Category:** Logic / repository context
- **Why this was a bug:**
  1. `parseRepoUrl()` used a 2-segment regex (`owner/repo`) for GitLab.
  2. Real GitLab repos often use subgroup paths (`group/subgroup/repo`).
  3. Parsed owner/repo were wrong, causing downstream fetch failures.
- **Fix implemented:**
  - Replaced regex parsing with URL-based parsing supporting subgroup namespaces.
  - Handles query strings, fragments, `.git`, and trailing slash safely.

## 5) SSH clone URLs were not supported for repo parsing

- **Category:** Logic / input handling
- **Why this was a bug:**
  1. Users often paste `git@github.com:owner/repo.git`.
  2. Previous parser only accepted HTTP URLs.
  3. Valid repository input was rejected.
- **Fix implemented:**
  - Added SSH URL parsing for GitHub/GitLab formats.

## 6) GitLab `/-/tree` and `/-/blob` style URLs parsed to wrong repo identity

- **Category:** Logic / input handling
- **Why this was a bug:**
  1. GitLab links commonly include `/-/tree/...` or `/-/blob/...`.
  2. Previous logic treated path suffixes as namespace/repo segments.
  3. Repository identity became corrupted.
- **Fix implemented:**
  - Parser now detects `/-/` marker and extracts repo identity before that marker.

## 7) GitLab subgroup blob URLs failed raw conversion

- **Category:** Data fetching
- **Why this was a bug:**
  1. `toRawUrl()` expected exactly `group/repo` for GitLab blob links.
  2. Subgroup blob links (`group/sub/repo/-/blob/...`) did not convert.
  3. Reference content fetch returned failures for valid links.
- **Fix implemented:**
  - Reworked GitLab blob conversion using URL path segment logic with subgroup support.

## 8) Private repository context ignored user tokens

- **Category:** Missing data / wasted failures
- **Why this was a bug:**
  1. UI/session accepted GitHub/GitLab tokens for private repos.
  2. `fetchContext()` was called without auth token in repo and automation flows.
  3. Private repos failed with not-found/forbidden despite valid credentials.
- **Fix implemented:**
  - Added optional auth token to `RepoService.fetchContext`.
  - GitHub requests now send `Authorization: Bearer <token>`.
  - GitLab requests now send `PRIVATE-TOKEN: <token>`.
  - Repo and automation controllers now forward the user token correctly.

## 9) Log buffer writes could throw and break main request logic

- **Category:** Reliability / wasted failures
- **Why this was a bug:**
  1. `logBuffer.add()` used synchronous filesystem writes with no guard.
  2. Any I/O issue could throw during AI/MCP request paths.
  3. Non-critical logging could fail critical user flows.
- **Fix implemented:**
  - Wrapped `add()` in try/catch and warn-only behavior.
  - Wrapped `query()` with fallback empty result on read failures.

## 10) MCP SSE parsing failed for multi-line `data:` payloads

- **Category:** Data parsing failure
- **Why this was a bug:**
  1. SSE parser kept only the last `data:` line.
  2. JSON split over multiple `data:` lines became invalid/incomplete.
  3. Tool list/call parsing could fail even on valid SSE streams.
- **Fix implemented:**
  - Parser now groups events, concatenates all `data:` lines per event, and parses the last valid JSON payload.

## 11) MCP notification RPC ignored HTTP failures

- **Category:** Logic / hidden failures
- **Why this was a bug:**
  1. Notification path returned success without checking `resp.ok`.
  2. Failed MCP init notifications were silently ignored.
  3. Downstream failures became harder to diagnose.
- **Fix implemented:**
  - Notification RPC now checks HTTP status and throws on non-OK responses.

## 12) LogBuffer.add() called pruneOldFiles() on every single write

- **Category:** Performance bottleneck
- **Why this was a bug:**
  1. `LogBuffer.add()` is invoked on every LLM and MCP operation (score, improve, compose, refine, etc.).
  2. Each call ran `pruneOldFiles()` which performs a synchronous `fs.readdirSync()`, regex matching, Date construction, and file-age comparison.
  3. A single user action (e.g., improve) generates 3–5 log entries, meaning 3–5 synchronous directory scans per action.
  4. This blocked the Node.js event loop on every request, adding measurable latency.
  5. `UsageTracker` already solved this pattern correctly with a periodic timer.
- **Fix implemented:**
  - Pruning is now handled by a periodic interval timer (1 hour), matching UsageTracker's design.
  - `ensureLogsDir()` uses a `dirReady` flag so it only runs once.
  - Timer is `unref()`ed to avoid blocking process exit.

## 13) LogBuffer.query() re-read disk when date filter was set

- **Category:** Performance / wasted I/O
- **Why this was a bug:**
  1. `query()` called `readRetention()` to load ALL ndjson files into memory.
  2. When `opts.date` was provided, it called `readRetention(opts.date)` AGAIN — re-reading one file from disk.
  3. That file's data was already present in the `fullWindow` array from step 1.
  4. Additionally, `readRetention()` called `pruneOldFiles()` on every invocation, so pruning ran twice per query.
- **Fix implemented:**
  - Date-filtered rows are now derived by filtering the already-loaded `fullWindow` array in memory using `e.timestamp.startsWith(date)`.
  - No second disk read occurs.

## 14) verifiedCache in credentialExtractor grew without bound — memory leak

- **Category:** Resource leak / reliability
- **Why this was a bug:**
  1. `verifiedCache` is a `Map<string, number>` that stores SHA-256 credential hashes → verification timestamps.
  2. On every authenticated request with valid credentials, a new entry was added.
  3. Expired entries were checked on lookup (5-minute TTL), but were never removed from the Map.
  4. Over time, as different users authenticated, memory consumption grew without bound.
- **Fix implemented:**
  - Added a periodic sweep timer (10-minute interval) that iterates the map and deletes entries older than the TTL.
  - Timer is `unref()`ed to avoid blocking process exit.

## 15) RepoCloneStore cache key was ambiguous — owner/repo collision

- **Category:** Logic / data corruption
- **Why this was a bug:**
  1. The cache key was computed as `${owner}-${repo}` (e.g., `my-org-sdk`).
  2. For a different repo `owner=my, repo=org-sdk`, the key was also `my-org-sdk` — identical.
  3. Both repos would share the same clone directory, causing data corruption.
  4. For GitLab subgroups where `owner=group/sub`, the key contained `/`, creating invalid directory paths.
- **Fix implemented:**
  - Key is now `${provider}_${sha256(owner/repo).slice(0,16)}` — a hash-based key that is unambiguous and filesystem-safe.

## 16) RepoCloneStore.ensureClone did not update remote URL for existing clones

- **Category:** Missing data / silent failure
- **Why this was a bug:**
  1. When a repo was first cloned, the authenticated URL (containing the user's token) was embedded in the git remote.
  2. On subsequent calls with a new or rotated token, `git pull` used the stale remote URL.
  3. If the original token expired, the pull silently failed (empty catch block).
  4. The user received stale repository data with no indication of failure.
- **Fix implemented:**
  - Before pulling, `git remote set-url origin <authedUrl>` is executed to update the remote with the current token.
  - The pull then authenticates with the latest credentials.

## 17) api.repo.uploadFiles had no timeout — could hang indefinitely

- **Category:** Reliability / resource leak
- **Why this was a bug:**
  1. Every API call going through the shared `request()` function gets an `AbortController` with a timeout.
  2. `uploadFiles` bypassed `request()` entirely, using raw `fetch` without a `signal` property.
  3. If the server was slow or unresponsive, the upload would hang forever.
  4. The user would see no feedback and the browser connection would remain open indefinitely.
- **Fix implemented:**
  - Added an `AbortController` with `DEFAULT_TIMEOUT_MS` (60 seconds), matching the pattern used in `request()`.
  - Abort errors are caught and converted to a user-friendly `TIMEOUT` error with a descriptive message.

## 18) JiraClient created a new TurndownService on every htmlToMarkdown call

- **Category:** Performance / wasted allocations
- **Why this was a bug:**
  1. `htmlToMarkdown()` is called once for the ticket description and once per comment.
  2. Each invocation created a new `TurndownService()` instance with identical config and two custom rules.
  3. For a ticket with 10 comments, that was 11 identical TurndownService instances per request.
  4. JiraClient itself is recreated per endpoint call, so no instance-level reuse occurred.
- **Fix implemented:**
  - TurndownService is now a static singleton via `JiraClient.getTurndown()`, created once on first use.
  - All invocations share the same configured instance.

## 19) Client handleFetch made a redundant getLinkedTickets API call

- **Category:** Wasted API calls
- **Why this was a bug:**
  1. `getTicket()` returns a `Ticket` object that already contains `linkedTickets: LinkedTicket[]` with key, summary, status, linkType, and direction for each linked issue.
  2. The client immediately called `getLinkedTickets(ticketData.key)`, which made ANOTHER server request.
  3. The server's `getLinkedTickets()` called `getTicket()` AGAIN, making a full Jira API fetch just to return the same linked ticket references already available in step 1.
  4. Every ticket fetch wasted one Jira API call.
- **Fix implemented:**
  - Removed the separate `getLinkedTickets` API call.
  - Linked ticket keys are now read directly from `ticketData.linkedTickets` (already available from the initial fetch).

## 20) Client fetched linked tickets sequentially instead of in parallel

- **Category:** Performance bottleneck
- **Why this was a bug:**
  1. Up to 5 linked tickets were fetched with `await` inside a `for...of` loop — strictly sequential.
  2. Each `getTicket()` call takes ~200–500ms (network + Jira API).
  3. With 5 linked tickets, total wait was ~1–2.5 seconds instead of ~200–500ms with parallelism.
  4. These are independent API calls with no ordering dependency.
- **Fix implemented:**
  - Replaced sequential loop with `Promise.allSettled()` for parallel fetching.
  - Failed fetches are gracefully filtered out (matching previous behavior of skipping inaccessible tickets).

## 21) Score API calls never included linkedTickets — missing data in scoring prompt

- **Category:** Logic / missing data
- **Why this was a bug:**
  1. The scoring prompt evaluates "context (weight 10%) — Links to related tickets, docs, designs, screenshots?"
  2. `formatTicketForPrompt()` only included linked ticket details when the optional `linkedTickets: Ticket[]` parameter was provided.
  3. The ticket's own `linkedTickets: LinkedTicket[]` array (with key, summary, status, linkType) was never referenced in the prompt.
  4. ALL score API calls from the client omitted the `linkedTickets` parameter entirely.
  5. Result: the "context" dimension was always scored lower than warranted for tickets with links.
  6. The improve endpoint DID pass `linkedTickets`, creating an inconsistency between scoring and improvement.
- **Fix implemented:**
  - `formatTicketForPrompt()` now falls back to including `ticket.linkedTickets` (the lightweight references) when the full `linkedTickets` parameter is not provided.
  - Client-side `handleRescore` and `handleSync` score calls now pass `linkedTickets` when available.

---

## Cross-Fix Compatibility Review (Safety Check)

Each fix was reviewed against all previously logged fixes (1–11) and against each other to confirm no negative interaction:

1. **Usage retry + caller warnings** only affect telemetry writes and do not alter core ticket APIs.
2. **PDF endpoint 501** prevents format mislabeling; Markdown export path remains unchanged.
3. **Content-type aware API parsing** is backward-compatible for all JSON APIs and only extends support for non-JSON.
4-6. **Repo URL parsing upgrades** are supersets of old behavior (simple URLs still parse identically).
7. **GitLab raw URL conversion** changes only GitLab blob normalization; non-GitLab paths unchanged.
8. **Auth token forwarding** is optional; public repo access remains unchanged when no token is provided.
9. **Log buffer guards** convert logging failures into warnings, reducing blast radius without mutating business logic.
10. **SSE multiline parsing** accepts more valid SSE shapes and preserves existing single-line behavior.
11. **Notification error propagation** surfaces real transport failures earlier; successful flows are unchanged.
12. **LogBuffer periodic pruning** replaces per-write pruning with a timer; write semantics and log contents are unchanged. Compatible with fix #9 (error guards remain intact).
13. **LogBuffer in-memory date filter** avoids a redundant disk read; query results are identical. No interaction with other fixes.
14. **verifiedCache sweep timer** removes expired entries only; verification behavior on read is unchanged. No interaction with auth or session flows.
15. **RepoCloneStore hash-based key** produces unambiguous filesystem-safe keys; does not affect URL parsing (fixes #4-7) or auth forwarding (fix #8).
16. **RepoCloneStore remote URL update** runs `git remote set-url` before pull; does not conflict with fix #8 (which addressed initial API-level auth, not git clone auth).
17. **uploadFiles abort signal** adds timeout to a code path that previously had none; does not affect the `request()` function or fix #3 (content-type branching).
18. **TurndownService singleton** changes allocation pattern but not behavior; HTML-to-Markdown conversion output is identical.
19. **Redundant getLinkedTickets removal** uses data already present in the fetched ticket; the subsequent individual ticket fetches still run and still respect auth tokens (fix #8).
20. **Parallel linked ticket fetch** uses Promise.allSettled for concurrent requests; same data as sequential, faster. No ordering dependency exists.
21. **Score includes linkedTickets** passes additional data to the scoring prompt; does not alter the improvement flow, MCP enrichment, or any other endpoint.

Confidence that all 21 fixes are mutually safe is high because each change is localized to its contract boundary, covered by regression tests, and avoids altering unrelated state models.

## 22) Server trusts AI's self-reported `overall` score without validation

- **Category:** Logic — incorrect score calculation
- **Why this was a bug:**
  1. The scoring prompt asks Gemini to compute a weighted overall score (0–100) from 6 dimension scores.
  2. The shared types define `DIMENSION_WEIGHTS` with the exact weights (clarity 0.2, completeness 0.25, actionability 0.2, testability 0.15, formatting 0.1, context 0.1).
  3. `GeminiAdapter.scoreTicket()` returned the AI's self-reported `overall` field verbatim — no validation.
  4. LLMs frequently miscalculate arithmetic. The AI could return `overall: 95` when the weighted sum actually computes to `72`.
  5. The ScoreCard UI, history entries, automation, and export all consumed this incorrect number.
- **Fix implemented:**
  - Added `GeminiAdapter.recalculateOverall()` which iterates the dimension scores, applies `DIMENSION_WEIGHTS`, and recomputes the overall from `(score/maxScore) * weight * 100`.
  - `scoreTicket()` now passes the parsed result through `recalculateOverall()` before returning.
  - The AI-provided `overall` is replaced by the server-computed value.

## 23) `readRetention()` still called `pruneOldFiles()` on every query

- **Category:** Performance — residual bottleneck from incomplete fix #12
- **Why this was a bug:**
  1. Fix #12 moved `pruneOldFiles()` out of `add()` into a periodic timer.
  2. However, the `readRetention()` helper — called by `query()`, `stats()`, and `list()` — independently hardcoded `pruneOldFiles()` on every invocation.
  3. `pruneOldFiles()` calls synchronous `readdirSync()` + date parsing for every file in the logs directory.
  4. Every admin panel load or log query re-ran pruning, blocking the event loop.
  5. The periodic timer made this per-call pruning redundant and wasteful.
- **Fix implemented:**
  - Removed the `pruneOldFiles()` call from `readRetention()`.
  - Pruning is now exclusively handled by the constructor timer (hourly) and startup call.

## 24) `parseJson` stripped triple backticks from inside JSON content values

- **Category:** Data corruption
- **Why this was a bug:**
  1. `parseJson()` used `text.replace(/```json\n?/g, '').replace(/```\n?/g, '')` globally.
  2. The improve prompt instructs the AI: "Use code blocks (with triple backticks)."
  3. When the AI writes code fences inside a description field, the JSON string value contains literal ` ``` ` characters.
  4. The global regex matched and removed those backticks from inside the JSON string, not just from the outer wrapper.
  5. Result: code fences silently disappeared from improved descriptions. `\`\`\`typescript\n...\n\`\`\`` became bare `typescript\n...\n`.
- **Fix implemented:**
  - `parseJson()` now only strips fences from the outer boundary: checks if the text starts with ` ``` `, removes the opening fence, then finds the last ` ``` ` and removes it.
  - Interior backticks in JSON string values are never touched.

## 25) `updateTicket` wiped description when only `acceptanceCriteria` changed

- **Category:** Logic — data loss
- **Why this was a bug:**
  1. `updateTicket()` computed: `let fullDescription = changes.description ?? ''`.
  2. If `changes.description` was `undefined` (user did NOT intend to change description), `fullDescription` became `''`.
  3. When `changes.acceptanceCriteria` was truthy, it appended AC to the empty string: `fullDescription = '\n\n## Acceptance Criteria\n\n...'`.
  4. Since `fullDescription` was truthy, `updateFields.description` was set — **replacing the entire existing Jira description** with only the AC section.
  5. The `TicketChanges` type explicitly makes `description` optional. Refinement, partial updates, and future integrations could trigger this path.
- **Fix implemented:**
  - The description field is only set in the Jira update payload when `changes.description !== undefined` OR `changes.acceptanceCriteria` is explicitly provided.
  - When neither is provided, the existing Jira description is left untouched.

## 26) Path traversal in `AutomationStore` via unsanitized `ticketKey`

- **Category:** Security — path traversal
- **Why this was a bug:**
  1. `AutomationStore.filePath()` joined the raw `ticketKey` directly into the filesystem path: `path.join(userDir, \`${ticketKey}.json\`)`.
  2. The `ticketKey` parameter in `dismiss` and `loadResult` comes from route parameters with no format validation.
  3. A crafted key like `../../etc/passwd` would resolve to a path outside the intended directory via `path.join()`.
  4. `dismiss` would call `fs.unlink()` on the traversed path — deleting arbitrary files.
  5. `loadResult` would call `fs.readFile()` — reading arbitrary files.
- **Fix implemented:**
  - Added `safeBasename()` that strips all characters except `[A-Za-z0-9_-]` (preserving valid Jira key formats like `PROJ-123`).
  - `filePath()` now calls `safeBasename(ticketKey)` before joining into the path.

## 27) Path traversal in `HistoryStore` via unsanitized snapshot `id`

- **Category:** Security — path traversal
- **Why this was a bug:**
  1. `HistoryStore.filePath()` joined the raw `id` directly into the filesystem path: `path.join(userDir, \`${id}.json\`)`.
  2. The `id` parameter in `load`, `remove`, and `markSynced` comes from route parameters (`req.params.id`) with no format validation.
  3. A crafted id like `../../../etc/passwd` would resolve outside the history directory.
  4. This allowed reading, modifying, or deleting arbitrary `.json` files on the server filesystem.
- **Fix implemented:**
  - Added `safeBasename()` with the same sanitization pattern as fix #26.
  - `filePath()` now calls `safeBasename(id)` before joining into the path.

## 28) `DiffView` labels comparison was order-sensitive — false "Changed" badge

- **Category:** UI / Visualization
- **Why this was a bug:**
  1. The DiffView compared labels by joining arrays with `join(', ')` and then checking string equality.
  2. The AI frequently returns the same labels in a different order than the original (e.g., `['bug', 'frontend']` vs `['frontend', 'bug']`).
  3. `'frontend, bug' !== 'bug, frontend'` → the UI showed a blue "Changed" badge for labels.
  4. This created visual noise and user confusion — the labels hadn't actually changed.
  5. Users might unnecessarily re-sync to Jira thinking labels were modified.
- **Fix implemented:**
  - Added `normalizeLabels()` that sorts labels alphabetically before joining.
  - Both original and improved labels are normalized before comparison.
  - Order-only differences no longer trigger the "Changed" indicator.

## 29) `MarkdownExporter` didn't escape pipe `|` in table cells — broken export

- **Category:** Data export corruption
- **Why this was a bug:**
  1. The score table in Markdown export used raw `dim.feedback` and `dim.name` inside table cells.
  2. AI-generated feedback frequently contains pipe characters (e.g., "Missing detail | needs elaboration").
  3. In Markdown, `|` is the column separator. An unescaped pipe inside a cell breaks the table layout.
  4. The exported Markdown would render with corrupted columns — cells shifted, extra columns appeared.
  5. Newline characters in feedback also broke the table (Markdown tables are single-line per row).
- **Fix implemented:**
  - Added `escPipe()` that replaces `|` with `\|` and `\n` with a space.
  - All variable cell content (name, feedback) is escaped before insertion into table rows.

## 30) `batchCreateTickets` created subtasks sequentially — performance bottleneck

- **Category:** Performance
- **Why this was a bug:**
  1. Subtask creation used a `for` loop with `await` — strictly sequential.
  2. Each `createTicket()` call takes ~200–500ms (Jira API round trip).
  3. With 8 subtasks, total wait was ~1.6–4 seconds instead of ~200–500ms with parallelism.
  4. Subtask creations are independent — they all reference the same parent key, and there's no ordering requirement.
  5. The linking step (`linkTickets`) only depends on the individual subtask's creation result, not on other subtasks.
- **Fix implemented:**
  - Replaced the sequential `for` loop with `Promise.allSettled()` for parallel subtask creation.
  - Each subtask's creation + optional linking is its own async task.
  - Errors for individual subtasks are captured per-item, preserving the existing error-reporting contract.

## 31) `HistoryStore.list` read all snapshot files sequentially

- **Category:** Performance
- **Why this was a bug:**
  1. `list()` is called every time the session history panel opens, and on every history refresh.
  2. With up to 50 snapshots per user (`MAX_SNAPSHOTS_PER_USER = 50`), each full `HistorySnapshot` JSON is read individually with `await fs.readFile()` inside a `for...of` loop.
  3. Each async file read takes ~1–5ms on typical storage, making 50 reads take 50–250ms sequentially.
  4. These reads are completely independent — no shared state or ordering requirement.
- **Fix implemented:**
  - Replaced the sequential `for...of` loop with `Promise.allSettled()` for parallel file reads.
  - Failed reads are filtered out (matching previous behavior of skipping corrupt files).
  - Sorting is performed on the collected results array after all reads complete.

---

## Cross-Fix Compatibility Review (Fixes 22–31 against all prior fixes 1–21)

Each fix was reviewed against all previously logged fixes (1–21) and against each other:

22. **Score recalculation** only modifies the `overall` field after parsing. Does not affect the scoring prompt, the AI response format, or any other endpoint. Compatible with fix #21 (linkedTickets in scoring) since it operates post-parse.
23. **readRetention prune removal** is a targeted deletion of one call inside a helper function. The prune timer from fix #12 remains the sole pruning mechanism. Compatible with fixes #9 (error guards), #12 (timer), and #13 (in-memory date filter).
24. **parseJson boundary-only stripping** changes how JSON is unwrapped but preserves the same parsing output for all valid JSON responses. The `responseMimeType: 'application/json'` setting means Gemini rarely wraps in fences — the fix is a safety net. Does not affect any prompt construction or scoring logic.
25. **updateTicket description guard** only changes WHEN the description field is sent in the PUT payload. The merge of description + AC remains identical when both are provided (the normal improve flow). Fixes #21 (linkedTickets) and #30 (parallel batch creation) are unaffected since they don't alter the update payload logic.
26. **AutomationStore path sanitization** only affects the filename derivation. Valid Jira keys (`PROJ-123`) contain only `[A-Z0-9-]` which passes through `safeBasename` unchanged. No behavioral change for legitimate keys. Does not interact with fixes #14 (cache), #15/#16 (clone store), or #8 (auth).
27. **HistoryStore path sanitization** mirrors fix #26 for snapshot ids. Valid ids (e.g., `PROJ-1-1716500000000`) contain only `[A-Za-z0-9-]` which passes through unchanged. Does not interact with any prior fix.
28. **DiffView label normalization** is a client-only UI change. Does not affect any server logic, API calls, or data flow. Compatible with all prior fixes.
29. **MarkdownExporter pipe escaping** only modifies the exported Markdown string. Does not affect the export API contract, content-type handling (fix #3), or any other endpoint. The escape function is local to the table rendering.
30. **Parallel batch creation** changes the execution order of subtask creation but produces the same results. The `Promise.allSettled` pattern matches fix #20 (parallel linked ticket fetch). No ordering dependency exists between subtasks. Compatible with fix #25 (updateTicket guard) since creation uses `createTicket`, not `updateTicket`.
31. **Parallel history reads** changes `HistoryStore.list` from sequential to parallel file reads. The `safeBasename` from fix #27 is applied in `filePath` which is used by both `list` and the direct load/delete paths — no conflict. The sorting step occurs after all reads, producing identical results.

Confidence that all 31 fixes are mutually safe is high because each change is localized to its contract boundary, covered by regression tests, and avoids altering unrelated state models.

## 32) `McpClient.rpc` has no timeout — MCP calls can hang indefinitely

- **Category:** Reliability — missing timeout
- **Why this was a bug:**
  1. Every other `fetch()` call in the codebase uses `AbortSignal.timeout()` — JiraClient (30s), GeminiAdapter (60s), McpAgent.askGemini (30s), RepoService (15s).
  2. `McpClient.rpc()` used raw `fetch()` with NO signal/timeout.
  3. If the MCP server was slow, unresponsive, or the connection hung, the fetch would wait indefinitely.
  4. Each MCP interaction (initialize, listTools, callTool) went through `rpc()`, so ANY of them could hang.
  5. This would block the entire request pipeline for the user with no feedback or recovery.
- **Fix implemented:**
  - Added `signal: AbortSignal.timeout(30_000)` to the fetch call in `rpc()`, matching the pattern used everywhere else.

## 33) Gemini safety-blocked responses produce misleading "empty response" error

- **Category:** Gemini integration — misleading error
- **Why this was a bug:**
  1. When Gemini blocks content for safety, the API returns `finishReason: 'SAFETY'` with empty content.
  2. The code checked `if (!text)` and threw `'Gemini returned an empty response.'` — a generic message.
  3. The user had no indication the content was blocked by safety filters.
  4. They might retry the same request repeatedly, always getting the same unhelpful error.
  5. The Gemini API explicitly provides `finishReason` to distinguish safety blocks from actual empty responses.
- **Fix implemented:**
  - `generateContent` now extracts `finishReason` from the candidate.
  - Safety blocks throw `GEMINI_SAFETY_BLOCK` with a clear message: "Gemini blocked the response due to safety filters."
  - MAX_TOKENS empty responses also get a specific message.

## 34) `automation.scan` parses the same repo URL twice — wasted computation

- **Category:** Wasted resources
- **Why this was a bug:**
  1. `RepoService.parseRepoUrl(profile.repoUrl)` was called once at line ~76 (result stored as `parsedRepo`).
  2. The exact same URL was parsed again at line ~88 (result stored as `mcpParsed`).
  3. Both calls returned identical `{ provider, owner, repo }` objects.
  4. `parseRepoUrl` creates a `URL` object, splits paths, applies regex matching — non-trivial work.
  5. The second call also had its own try/catch, duplicating error-handling logic.
- **Fix implemented:**
  - Merged both code blocks into a single `if (profile.repoUrl)` block that parses once.
  - Reuses `mcpParsed` for both repo context fetching and MCP URL resolution.

## 35) `cursorActiveCount` race condition between check and increment

- **Category:** Cursor integration — concurrency bug
- **Why this was a bug:**
  1. The concurrency check (`cursorActiveCount >= admin.cursorMaxConcurrent`) happened BEFORE multiple `await` calls (AdminStore.load, parseRepoUrl, RepoCloneStore.ensureClone).
  2. The increment (`cursorActiveCount++`) happened AFTER those awaits.
  3. In between the check and increment, Node.js could yield to the event loop, allowing another concurrent request to also pass the check.
  4. With 8 simultaneous requests and `cursorMaxConcurrent = 8`, all 8 could pass the check before any incremented the counter.
  5. This exceeded the intended concurrency limit, potentially overloading the Cursor API.
- **Fix implemented:**
  - Moved `cursorActiveCount++` immediately after the concurrency check, before any async work.
  - All three Cursor paths (improve, compose, breakdown) now increment atomically with the check.

## 36) `storyPoints: 0` treated as null — valid value lost

- **Category:** Logic — data loss
- **Why this was a bug:**
  1. `getTicket()` used `fields.customfield_10016 || null` to extract story points.
  2. The `||` operator treats `0` as falsy, so `0 || null` evaluates to `null`.
  3. `0` is a valid story point value (used for spike tasks, zero-effort items, or explicitly estimated as zero).
  4. A ticket with 0 story points would display as "(not set)" in the UI.
  5. If the user improved the ticket, the AI might add story points where the team intentionally set zero.
- **Fix implemented:**
  - Changed `||` to `??` (nullish coalescing), which only falls through on `null` or `undefined`, preserving `0`.

## 37) `AdminStore.load()` reads settings from disk on every AI request

- **Category:** Performance — wasted disk I/O
- **Why this was a bug:**
  1. `AdminStore.load()` calls `fs.readFile()` + `JSON.parse()` on every invocation.
  2. It's called in `enrichWithMcpFromReq()` (every score/improve/compose/breakdown/enrich/refine/questions call).
  3. Cursor paths call it again in `improveWithCursor`/`composeWithCursor`/`breakdownWithCursor`.
  4. A single Cursor improve request triggered 2 disk reads of the same file.
  5. Admin settings change extremely rarely (admin panel save, maybe once per week).
  6. Every request paid for unnecessary filesystem I/O.
- **Fix implemented:**
  - Added a module-level cache with a 60-second TTL.
  - `load()` returns cached settings if they're less than 60 seconds old.
  - `save()` updates the cache immediately, so admin changes take effect instantly.

## 38) `computeStats` iterates log entries 5 times — single pass possible

- **Category:** Performance — wasted computation
- **Why this was a bug:**
  1. `computeStats()` created two filtered arrays (`llm`, `mcp`) — passes 1 and 2.
  2. It then looped all entries for the byDate map — pass 3.
  3. It filtered `llm` for errors — pass 4.
  4. It filtered `mcp` for errors — pass 5.
  5. The query system allows up to 50,000 entries. Five iterations over 50K entries means 250K array element accesses.
  6. Additionally, passes 1-2 created large intermediate arrays that were only used for `.length` and a subsequent filter.
- **Fix implemented:**
  - Replaced with a single-pass loop using counter variables.
  - Eliminated all intermediate array allocations.
  - Same output, ~5x fewer iterations, zero intermediate allocations.

## 39) Gemini `MAX_TOKENS` truncation produces misleading parse error

- **Category:** Gemini integration — silent data corruption
- **Why this was a bug:**
  1. `generateContent` uses `maxOutputTokens: 8192` (~6000 words).
  2. For complex operations (breakdownTicket with 8 subtasks, improve with many sections), the JSON output can exceed this limit.
  3. When truncated, Gemini returns `finishReason: 'MAX_TOKENS'` with a partial JSON string.
  4. `generateContent` returned this partial text without checking `finishReason`.
  5. `parseJson` then failed with `'Failed to parse Gemini response as JSON.'` — a generic error.
  6. The user had no clue the issue was output truncation and might retry indefinitely.
- **Fix implemented:**
  - After extracting text, `generateContent` checks if `finishReason === 'MAX_TOKENS'` and `jsonMode` is true.
  - If so, it throws `GEMINI_TRUNCATED` with a clear message: "Try breaking the request into smaller parts or reducing scope."
  - The log entry also records the truncation explicitly.

## 40) Initial score during `handleFetch` never includes fetched linkedTickets

- **Category:** Missing data — inconsistent scoring
- **Why this was a bug:**
  1. `handleFetch` fetches linked tickets via `Promise.allSettled()` and stores them in a local `fullLinked` array.
  2. The score API call immediately after did NOT pass `linkedTickets` at all.
  3. The "context" scoring dimension evaluates "Links to related tickets, docs, designs, screenshots?" — weight 10%.
  4. Without linked ticket data, the initial score's context dimension was always scored lower than warranted.
  5. `handleRescore` and `handleSync` DID pass `linkedTickets`, causing inconsistency: the initial score was artificially low, and the rescore was higher — even with zero improvements.
  6. This undermined user trust in the scoring system ("Why did my score go up without changes?").
- **Fix implemented:**
  - The local `fetchedLinked` variable is now passed as `linkedTickets` in the initial score API call.
  - Initial and subsequent scores now use the same data, producing consistent results.

## 41) `McpAgent` hardcodes `provider: 'github'` in all log entries and stats

- **Category:** MCP / Data logging — incorrect metadata
- **Why this was a bug:**
  1. `McpAgent.gatherContext()` hardcoded `provider: 'github'` in the `logBuffer.add()` call for initialize.
  2. `emptyStats()` hardcoded `provider: 'github'`.
  3. All tool call log entries hardcoded `provider: 'github'`.
  4. The final `stats` object hardcoded `provider: 'github'`.
  5. The AI controller overwrote `stats.provider` after the call, but ALL internal log entries remained as 'github'.
  6. For GitLab repos, the admin logs panel showed every MCP operation as "github" — incorrect and confusing.
- **Fix implemented:**
  - Added `provider` field to `McpAgentConfig`.
  - All log entries and stats now use `this.config.provider ?? 'github'`.
  - Both `AIController.enrichWithMcpFromReq` and `AutomationController.scan` now pass `provider: parsed.provider` in the config.

---

## Cross-Fix Compatibility Review (Fixes 32–41 against all prior fixes 1–31)

Each fix was reviewed against all previously logged fixes (1–31) and against each other:

32. **McpClient timeout** adds a 30-second `AbortSignal.timeout` to an existing fetch call. Does not change HTTP semantics, request format, or response parsing. The fix is additive and doesn't interact with fix #10 (SSE parsing) or #11 (notification error check) since those operate post-response.
33. **Gemini safety/empty distinction** only changes the error message and code thrown on the empty-text path. Successful responses are unchanged. Compatible with fix #22 (recalculateOverall) and #24 (parseJson) since those operate on the success path.
34. **Automation single-parse** merges two code blocks into one, reusing the same parsed result. The logic is identical — only the duplication is removed. Compatible with fixes #4-7 (URL parsing) since the parser itself is unchanged.
35. **cursorActiveCount atomicity** moves the increment before async work. The finally-block decrement remains, so the counter always matches. Compatible with all prior fixes since no other code reads `cursorActiveCount`.
36. **storyPoints nullish coalescing** changes `||` to `??` for a single field. Only affects the `0` case. Does not interact with fix #25 (updateTicket description guard) since that operates on `changes.description`, not `storyPoints`.
37. **AdminStore cache** adds an in-memory TTL cache. `save()` updates the cache immediately, so admin changes via fix #11 (notification) or any admin panel action take effect instantly. The 60s TTL means worst-case stale data is 1 minute — acceptable for settings that change weekly.
38. **computeStats single-pass** produces identical output with fewer iterations. No API or format changes. Compatible with fixes #12/#13 (log buffer query) since it's a pure computation function.
39. **Gemini MAX_TOKENS check** adds an early throw before `parseJson` is called. When `finishReason !== 'MAX_TOKENS'`, the path is unchanged. Compatible with fix #24 (parseJson boundary stripping) since truncated responses never reach `parseJson`.
40. **Initial score linkedTickets** passes additional data already available in the local scope. Does not change the score API contract, response handling, or any other endpoint. Compatible with fix #21 (which added linkedTickets to rescore/sync but missed the initial fetch).
41. **McpAgent provider config** replaces hardcoded strings with a config value. Defaults to `'github'` when not provided (backward-compatible). The controller no longer needs `stats.provider = parsed.provider` post-hoc since the agent uses the correct value from the start.

Confidence that all 41 fixes are mutually safe is high because each change is localized to its contract boundary, covered by regression tests, and avoids altering unrelated state models.
