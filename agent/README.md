# nestus-agent

The NESTUS execution-plane agent. Runs on every managed server, dials **out** to
the control plane over a gRPC bidirectional stream (NAT friendly), reports
telemetry and runs typed, allowlisted commands only.

## Build

```sh
cd agent
make build          # linux/amd64 + linux/arm64 into bin/
go run ./cmd/nestus-agent version
```

## Run (dev)

```sh
make -C agent agent-run
# or: cd agent && go run ./cmd/nestus-agent run
```

`enroll` connects this server to the control plane (implemented in Phase 3).
