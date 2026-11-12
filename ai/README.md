# NESTUS AI — intelligence plane

Python FastAPI + LangGraph service. Reasons over real evidence collected by the
control plane and proposes structured actions. **It never runs anything itself.**

## Dev

```sh
make ai-dev
# or:
cd ai
uv sync
uv run uvicorn nestus_ai.main:app --reload --port 8000
curl localhost:8000/health
```

LangGraph and the model providers are added in Phase 9.
