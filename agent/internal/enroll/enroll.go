// Package enroll talks to AgentGateway.Enroll and persists credentials.
package enroll

import (
	"context"
	"fmt"
	"time"

	nestusv1 "github.com/0xdevabir/nestus/agent/gen/nestus/v1"
	"github.com/0xdevabir/nestus/agent/internal/config"
	"github.com/0xdevabir/nestus/agent/internal/docker"
	"github.com/0xdevabir/nestus/agent/internal/facts"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// Options for the enroll RPC.
type Options struct {
	URL   string
	Token string
	// CredsPath where credentials.json is written.
	CredsPath string
}

// Run collects host facts, calls Enroll, and persists credentials (0600).
func Run(ctx context.Context, opts Options) (*config.Credentials, error) {
	if opts.URL == "" {
		return nil, fmt.Errorf("url is required")
	}
	if opts.Token == "" {
		return nil, fmt.Errorf("token is required")
	}
	if opts.CredsPath == "" {
		return nil, fmt.Errorf("credentials path is required")
	}

	dockerClient := docker.New()
	defer dockerClient.Close()

	hostFacts := facts.Collect(ctx, dockerClient)

	dialCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	conn, err := grpc.DialContext(dialCtx, opts.URL, //nolint:staticcheck // DialContext is fine for insecure enroll
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		return nil, fmt.Errorf("dial %s: %w", opts.URL, err)
	}
	defer conn.Close()

	client := nestusv1.NewAgentGatewayClient(conn)
	resp, err := client.Enroll(ctx, &nestusv1.EnrollRequest{
		EnrollmentToken: opts.Token,
		Facts:           hostFacts,
	})
	if err != nil {
		return nil, fmt.Errorf("enroll: %w", err)
	}
	if resp.GetAgentId() == "" || resp.GetAgentSecret() == "" {
		return nil, fmt.Errorf("enroll response missing agent credentials")
	}

	creds := &config.Credentials{
		AgentID:     resp.GetAgentId(),
		AgentSecret: resp.GetAgentSecret(),
		ServerID:    resp.GetServerId(),
		URL:         opts.URL,
	}
	if err := config.SaveCredentials(opts.CredsPath, creds); err != nil {
		return nil, fmt.Errorf("save credentials: %w", err)
	}
	return creds, nil
}
