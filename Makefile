.PHONY: infra-up infra-down dev agent-build agent-run ai-dev proto

infra-up:
	docker compose -f infra/docker-compose.dev.yml up -d

infra-down:
	docker compose -f infra/docker-compose.dev.yml down

dev:
	pnpm dev

agent-build:
	cd agent && make build

agent-run:
	cd agent && go run ./cmd/nestus-agent run

ai-dev:
	cd ai && uv run uvicorn nestus_ai.main:app --reload --port 8000

proto:
	pnpm proto:gen
