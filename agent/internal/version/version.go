// Package version holds build metadata injected with -ldflags at build time.
package version

var (
	// Version is the semantic version of the agent.
	Version = "dev"
	// Commit is the git commit the binary was built from.
	Commit = "unknown"
	// BuildDate is the RFC3339 build timestamp.
	BuildDate = "unknown"
)
