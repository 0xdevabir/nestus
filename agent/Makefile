.PHONY: build run proto lint

build:
	mkdir -p bin
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath \
		-ldflags "-s -w -X github.com/0xdevabir/nestus/agent/internal/version.Version=$(shell git describe --tags --always --dirty 2>/dev/null || echo dev) \
		-X github.com/0xdevabir/nestus/agent/internal/version.Commit=$(shell git rev-parse --short HEAD 2>/dev/null || echo unknown) \
		-X github.com/0xdevabir/nestus/agent/internal/version.BuildDate=$(shell date -u +%Y-%m-%dT%H:%M:%SZ)" \
		-o bin/nestus-agent-linux-amd64 ./cmd/nestus-agent
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath \
		-ldflags "-s -w -X github.com/0xdevabir/nestus/agent/internal/version.Version=$(shell git describe --tags --always --dirty 2>/dev/null || echo dev) \
		-X github.com/0xdevabir/nestus/agent/internal/version.Commit=$(shell git rev-parse --short HEAD 2>/dev/null || echo unknown) \
		-X github.com/0xdevabir/nestus/agent/internal/version.BuildDate=$(shell date -u +%Y-%m-%dT%H:%M:%SZ)" \
		-o bin/nestus-agent-linux-arm64 ./cmd/nestus-agent

run:
	go run ./cmd/nestus-agent run

proto:
	cd .. && buf generate

lint:
	go vet ./...
