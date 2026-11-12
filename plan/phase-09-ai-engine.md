# Phase 09 — AI Engineering Agent (Intelligence Plane)

**Goal:** A Python service (FastAPI + LangGraph) that investigates incidents and answers questions using **real infrastructure evidence** from read-only tools, finds root causes with confidence scores and citations, writes postmortems, and **proposes** (never executes) registered recovery actions through the Phase 8 Recovery Engine.
**Depends on:** Phase 08
**No tests in this phase.**

---

## 1. Design principles (put these in `ai/README.md`)
1. **Evidence first:** every claim must cite an `evidence_id` returned by a tool call in the same run. A validator removes or flags claims without a valid citation.
2. **Read-only tools plus one proposal tool.** The AI cannot call `CommandService` or any mutation except `propose_action`. That call goes through the guardrails and approval flow.
3. **Least privilege:** the API mints a short-lived (10 min) JWT per AI run, scoped to `{orgId, runId, permissions: [read perms..., action:propose]}`. The AI service holds no long-lived org credentials.
4. **Token discipline:** the tools return *summarized* data (stats, anomalies, deduped log clusters), not raw dumps.
5. **"Insufficient evidence" is a valid answer.**

## 2. AI service structure (`ai/src/nestus_ai/`)
```
nestus_ai/
├─ main.py                 # FastAPI app, routers, lifespan (checkpointer, http client)
├─ settings.py
├─ auth.py                 # verify INTERNAL_SERVICE_TOKEN on inbound; carry run token for outbound
├─ llm.py                  # provider factory
├─ api_client.py           # httpx client for NestJS /internal/v1 (run-scoped token)
├─ tools/                  # LangChain @tool definitions (thin wrappers over api_client)
│  ├─ infra.py  metrics.py  logs.py  deployments.py  incidents.py  traces.py  db.py  actions.py
├─ evidence.py             # EvidenceStore: registers each tool result with an id (ev_xxx), summary, source link
├─ graphs/
│  ├─ investigation.py     # incident root-cause StateGraph
│  ├─ chat.py              # conversational ReAct agent
│  ├─ deploy_failure.py    # explain failed build/deploy
│  └─ postmortem.py
├─ prompts/                # *.md system prompts (versioned)
├─ validators.py           # citation validator, action proposal validator
├─ memory.py               # past-incident embeddings (fastembed + pgvector via API)
└─ schemas.py              # pydantic output models
```
- [ ] Dependencies: `langgraph`, `langgraph-checkpoint-postgres`, `langchain-core`, `langchain-anthropic`, `langchain-openai`, `langchain-ollama`, `fastembed`, `httpx`, `sse-starlette`, `pydantic`, `structlog`, `tenacity`
- [ ] `llm.py`: `get_chat_model(role: "reasoning" | "fast")`:
  - `anthropic` → `ChatAnthropic(model="claude-sonnet-5-5")` for reasoning, `"claude-haiku-5-5"` for fast
  - `openai` → model from `OPENAI_MODEL`
  - `ollama` → `ChatOllama(model=OLLAMA_MODEL, base_url=...)`
  - temperature 0 for investigations. Timeouts plus retries with `tenacity`.
- [ ] Checkpointer: `AsyncPostgresSaver` on the main DB (schema `ai`) so investigations are resumable and inspectable

## 3. Internal API for the AI (NestJS `modules/ai-internal`, prefix `/internal/v1`)
- [ ] Guard: `Authorization: Bearer <run-jwt>` signed with `INTERNAL_SERVICE_TOKEN`-derived key. Reject anything outside its org and permission scope.
- [ ] Every response includes `{ evidence: { kind, ref, link } , data }` so the AI can cite it, and the UI can deep-link (e.g. `link: /monitoring?server=..&from=..&to=..`)
- [ ] Endpoints (summarized for LLM use):
  | Endpoint | Returns |
  |---|---|
  | `GET /servers` | id, name, status, cpu/mem/disk now |
  | `GET /servers/:id` | facts + latest metrics + containers |
  | `GET /metrics/summary?target&metric&from&to` | min/max/avg/p95, first/last, trend slope, **change points** (simple CUSUM or z-score of 1m buckets), 30 downsampled points |
  | `GET /containers/:id/events?from&to` | die/oom/restart events |
  | `GET /logs/summary?app&level&q&from&to` | total count, counts by level, **top 15 clusters** (normalized fingerprint → count + 2 sample lines), first error timestamp |
  | `GET /errors?app&from&to` | error groups (title, count, firstSeen, introducedIn) |
  | `GET /deployments?app&limit` | number, status, sha, message, author, live time, duration |
  | `GET /deployments/:id/diff` | GitHub compare between the previous LIVE and this one: commits + changed files list (+ patch of ≤10 files, ≤200 lines each) |
  | `GET /deployments/:id/logs/tail?lines=200` | build/deploy log tail |
  | `GET /http-checks?app` | uptime %, last failures, latency trend |
  | `GET /db/summary?monitor` | connection usage %, waiting, longest query, top 5 slow queries |
  | `GET /traces/summary?app&from&to` | RED stats, slowest endpoints, error endpoints, slow downstream deps |
  | `GET /topology?around=app:<id>` | neighbors and their health (phase 10 enriches) |
  | `GET /incidents/:id` | full incident + timeline + alerts |
  | `GET /incidents/similar?text&k=3` | past resolved incidents with root cause + fix (pgvector) |
  | `GET /actions/catalog?targetType` | registered actions with description, risk, params JSON schema |
  | `POST /actions/propose` | → `RecoveryService.propose({proposedByType:'AI', rationale, evidence})` |

## 4. Tools (`ai/src/nestus_ai/tools`)
- [ ] Each tool: typed args (pydantic), calls the API, registers the result in `EvidenceStore` → returns compact text/JSON to the LLM that **starts with** `[evidence_id=ev_ab12]`
- [ ] Tool list: `list_servers`, `get_server`, `get_metric_summary`, `get_container_events`, `search_logs`, `get_error_groups`, `list_deployments`, `get_deployment_diff`, `get_deployment_logs`, `get_http_checks`, `get_db_summary`, `get_traces_summary`, `get_topology`, `get_incident`, `find_similar_incidents`, `list_available_actions`, `propose_action`
- [ ] `propose_action(action_type, params, rationale, evidence_ids)` → validator first: action type in the catalog, params pass its JSON schema, at least 1 valid evidence id → then POST. Returns the resulting action status (`PENDING_APPROVAL` / `APPROVED` / `SKIPPED: reason`).
- [ ] Hard limits per run: max 25 tool calls, max 120s wall time, max tokens budget (configurable). On hitting a limit, produce the best answer with what was gathered.

## 5. Investigation graph (`graphs/investigation.py`)

```
START → load_context → triage → gather_evidence ⇄ (loop ≤3) → hypothesize → verify → recommend → validate → persist → END
```
State (TypedDict): `incident`, `context`, `plan`, `evidence` (ids), `hypotheses: [{statement, confidence, supporting[], contradicting[]}]`, `iterations`, `result`.

- [ ] **load_context:** `get_incident` + `find_similar_incidents`
- [ ] **triage** (fast model, structured output): classify the category (`resource_exhaustion | bad_deploy | dependency_failure | config_error | traffic_spike | infra_failure | unknown`) and produce an **evidence plan** (list of tool calls with args)
- [ ] **gather_evidence:** run the planned tool calls **in parallel** (`asyncio.gather`), collect evidence
- [ ] **hypothesize** (reasoning model, structured output `HypothesisSet`): 1–4 hypotheses ranked, each with supporting/contradicting evidence ids and what extra evidence would confirm it
- [ ] Conditional edge: if the top confidence < 0.7 and iterations < 3 → generate follow-up tool calls → back to gather_evidence
- [ ] **verify:** check each top hypothesis for timeline consistency (does the cause happen *before* the symptom? Compare timestamps from evidence deterministically in Python, not in the LLM). Adjust confidence.
- [ ] **recommend** (structured `InvestigationResult`):
  ```python
  class InvestigationResult(BaseModel):
      summary: str                      # 2-3 sentences
      root_cause: str
      category: str
      confidence: float                 # 0..1
      evidence: list[EvidenceCitation]  # {evidence_id, why_relevant}
      timeline: list[TimelineItem]      # {ts, description, evidence_id}
      recommended_actions: list[ActionRecommendation]  # {action_type?, params?, description, risk, requires_human: bool}
      manual_steps: list[str]           # things the AI can't do (e.g. "add an index on orders.user_id")
      unknowns: list[str]
  ```
- [ ] **validate** (`validators.py`): every cited `evidence_id` exists in the store. Remove timeline items or evidence that don't. If the root cause cites no valid evidence → confidence capped at 0.3 and the summary is prefixed with "Low confidence:". Recommended actions must reference catalog types.
- [ ] **persist:** POST the result to the API → `AIAnalysis` row + IncidentEvent `AI_ANALYSIS` + `Incident.rootCause` (if confidence ≥ 0.6 and no human root cause yet) + optional auto-propose: for each recommended action with `action_type`, call `propose_action` (goes to approval unless a policy allows it)

## 6. Other graphs
- [ ] **Chat agent** (`graphs/chat.py`): `create_react_agent` with all read tools + `propose_action`. The system prompt states the evidence rule and asks for a short answer with citations rendered as `[ev_xxx]`. Conversation memory comes from the checkpointer, keyed by `thread_id = conversationId`.
- [ ] **Deploy failure explainer:** input = deployment id → tail the logs + diff → output `{ failing_step, error_excerpt, likely_cause, fix_suggestion, confidence }`
- [ ] **Postmortem generator:** on `incident.resolved` (SEV1–SEV3) → markdown with Summary, Impact (duration, affected apps, failed checks), Timeline, Root cause, Resolution, What went well / badly, Action items. Saved to `Incident.postmortem` (new text field). Editable in the UI.
- [ ] **Incident memory:** on resolve, embed `title + rootCause + resolution` with fastembed `BAAI/bge-small-en-v1.5` (384 dims) → `POST /internal/v1/incidents/:id/embedding` → stored in `IncidentEmbedding(incidentId, embedding vector(384))` with an HNSW index

## 7. AI service HTTP API (called only by NestJS)
- [ ] `POST /v1/investigations {incident_id, run_token}` → 202 `{run_id}`. Runs in the background (asyncio task). Progress is POSTed back to `/internal/v1/ai/runs/:id/progress` (step names + tool calls) so the UI can show it live.
- [ ] `POST /v1/chat {conversation_id, message, run_token}` → **SSE stream** of events: `token`, `tool_start {name, args}`, `tool_end {evidence_id, summary, link}`, `final {content, citations}`, `error`
- [ ] `POST /v1/deployments/explain`, `POST /v1/postmortems`
- [ ] Usage: return `{model, input_tokens, output_tokens}` for every run so the API can track cost

## 8. NestJS side (`modules/ai`)
```prisma
model AIRun { id String @id @default(cuid()) orgId String kind String /* INVESTIGATION|CHAT|DEPLOY_EXPLAIN|POSTMORTEM */ status String incidentId String? deploymentId String? conversationId String? steps Json @default("[]") model String? inputTokens Int @default(0) outputTokens Int @default(0) costUsd Float @default(0) durationMs Int? error String? createdById String? createdAt DateTime @default(now()) }
model AIAnalysis { id String @id @default(cuid()) orgId String runId String @unique incidentId String? result Json confidence Float createdAt DateTime @default(now()) }
model AIConversation { id String @id @default(cuid()) orgId String userId String title String createdAt DateTime @default(now()) updatedAt DateTime @updatedAt }
model AIMessage { id String @id @default(cuid()) conversationId String role String content String toolSteps Json? citations Json? createdAt DateTime @default(now()) }
model IncidentEmbedding { incidentId String @id embedding Unsupported("vector(384)") }
```
- [ ] `POST /incidents/:id/investigate` (perm `ai:investigate`) → mint the run token → call the AI service → AIRun
- [ ] **Auto-investigate:** on `incident.opened` with severity ≤ the configured threshold (org setting `aiAutoInvestigateSeverity`, default SEV2) → wait 60s (to let evidence accumulate) → investigate
- [ ] `POST /deployments/:id/explain` (auto-run on `deployment.failed` if enabled)
- [ ] Chat: `GET/POST /ai/conversations`, `GET /ai/conversations/:id/messages`, `POST /ai/conversations/:id/messages` → **SSE proxy** that streams from the AI service to the browser and persists the final message
- [ ] Progress relay: `/internal/v1/ai/runs/:id/progress` → Socket.IO `incident:<id>` / `airun:<id>`
- [ ] Usage & limits: per-org monthly token budget (org setting). Return 429 when exceeded. Cost table per model in config.
- [ ] Audit: `ai.investigation.started`, `ai.action.proposed` (actor AI, with the runId)

## 9. Web
- [ ] **AI Engineer page** `/ai`:
  - Left: conversation list + "New chat"
  - Center: chat with streaming markdown. Tool steps render as compact collapsible rows ("🔍 Checked memory on vps-02 · last 1h", "📜 Searched error logs for parkbd · 1,240 lines → 6 clusters"). Citations `[ev_xxx]` render as chips that open a side drawer showing the evidence summary + "Open in Monitoring/Logs" link.
  - Suggested prompts: "Why is my server running slowly?", "Why did my application crash?", "Analyze the last 1000 error logs", "Which application uses the most RAM?", "What caused the latest deployment failure?"
  - Action proposals in chat render as an **Action card** (type, target, risk, rationale, status), linking to the approval inbox
- [ ] **Incident detail → AI Analysis panel:** "Investigate with AI" button. Live step progress while running. Result: root cause headline, confidence bar (color-coded), category badge, evidence list with links, timeline merged into the incident timeline (AI badge), recommended actions with "Propose" / status, manual steps checklist, unknowns. Feedback buttons 👍/👎 (store on AIAnalysis).
- [ ] **Postmortem tab** on resolved incidents: rendered markdown + edit (textarea/MDX editor) + "Regenerate" + copy as markdown
- [ ] **Deployment detail (FAILED):** "Explain this failure" card with likely cause + fix
- [ ] **Settings → AI:** provider status (read-only from server), auto-investigate severity threshold, auto-explain failed deploys toggle, monthly budget, usage chart (tokens/cost by kind, last 30 days)

---

## Done when
- [ ] Ask "Which application is using the most RAM?" → a correct answer citing a metrics evidence chip that opens the right chart
- [ ] Deploy a release with a memory leak (an endpoint that grows an array) → OOM → incident → auto-investigation identifies "memory exhaustion after deployment #N" with ≥ 0.7 confidence, cites the memory trend + OOM event + deployment, and proposes `deployment.rollback`, which **waits for approval**
- [ ] Saturate a Postgres pool (load test the app) → the AI points to DB connections near max + slow queries, and lists manual steps (pooling/index) instead of inventing an action
- [ ] Ask about something with no data (e.g. a server that doesn't exist) → the AI says it lacks evidence. No hallucinated numbers.
- [ ] A failed build gets a correct "Explain this failure" summary
- [ ] Resolving an incident generates a postmortem. A similar later incident shows the earlier one under "similar incidents".
- [ ] The AI can't run anything directly: check the audit log — every AI action shows actor AI → PENDING_APPROVAL (unless an explicit policy allows LOW risk)
- [ ] Switching `LLM_PROVIDER=ollama` (with a local model) still works for chat
