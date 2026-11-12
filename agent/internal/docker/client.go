// Package docker wraps the Docker Engine API for the agent.
package docker

import (
	"context"
	"fmt"
	"strings"
	"time"

	nestusv1 "github.com/0xdevabir/nestus/agent/gen/nestus/v1"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

// Client is a thin Docker Engine wrapper. Available is false when the daemon is unreachable.
type Client struct {
	cli       *client.Client
	Available bool
}

// New creates a Docker client from the environment. Failure leaves Available=false.
func New() *Client {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return &Client{Available: false}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if _, err := cli.Ping(ctx); err != nil {
		_ = cli.Close()
		return &Client{Available: false}
	}
	return &Client{cli: cli, Available: true}
}

// Close releases the underlying client.
func (c *Client) Close() error {
	if c == nil || c.cli == nil {
		return nil
	}
	return c.cli.Close()
}

// Version returns the Docker engine version or empty if unavailable.
func (c *Client) Version(ctx context.Context) string {
	if c == nil || !c.Available || c.cli == nil {
		return ""
	}
	v, err := c.cli.ServerVersion(ctx)
	if err != nil {
		return ""
	}
	return v.Version
}

// ListContainers returns all containers (running and stopped).
func (c *Client) ListContainers(ctx context.Context) ([]*nestusv1.ContainerInfo, error) {
	if c == nil || !c.Available || c.cli == nil {
		return nil, fmt.Errorf("docker unavailable")
	}
	list, err := c.cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, err
	}
	out := make([]*nestusv1.ContainerInfo, 0, len(list))
	for _, item := range list {
		info := &nestusv1.ContainerInfo{
			Id:          item.ID,
			Image:       item.Image,
			State:       item.State,
			Status:      item.Status,
			CreatedUnix: item.Created,
			Labels:      item.Labels,
		}
		if len(item.Names) > 0 {
			info.Name = strings.TrimPrefix(item.Names[0], "/")
		}
		for _, p := range item.Ports {
			if p.PublicPort > 0 {
				info.Ports = append(info.Ports, fmt.Sprintf("%s:%d->%d/%s", p.IP, p.PublicPort, p.PrivatePort, p.Type))
			} else {
				info.Ports = append(info.Ports, fmt.Sprintf("%d/%s", p.PrivatePort, p.Type))
			}
		}
		for netName := range item.NetworkSettings.Networks {
			info.Networks = append(info.Networks, netName)
		}
		// Prefer first network IP.
		for _, ns := range item.NetworkSettings.Networks {
			if ns.IPAddress != "" {
				info.IpAddress = ns.IPAddress
				break
			}
		}
		out = append(out, info)
	}
	return out, nil
}

// Inspect returns a map suitable for CommandResult output.
func (c *Client) Inspect(ctx context.Context, containerID string) (map[string]any, error) {
	if c == nil || !c.Available || c.cli == nil {
		return nil, fmt.Errorf("docker unavailable")
	}
	raw, err := c.cli.ContainerInspect(ctx, containerID)
	if err != nil {
		return nil, err
	}
	out := map[string]any{
		"id":      raw.ID,
		"name":    strings.TrimPrefix(raw.Name, "/"),
		"image":   raw.Config.Image,
		"state":   raw.State.Status,
		"status":  raw.State.Status,
		"created": raw.Created,
	}
	if raw.State != nil {
		out["running"] = raw.State.Running
		out["exitCode"] = float64(raw.State.ExitCode)
		out["startedAt"] = raw.State.StartedAt
		out["finishedAt"] = raw.State.FinishedAt
		out["restartCount"] = float64(raw.RestartCount)
		if raw.State.Health != nil {
			out["health"] = raw.State.Health.Status
		}
	}
	return out, nil
}

// Start starts a container by ID.
func (c *Client) Start(ctx context.Context, containerID string) error {
	if c == nil || !c.Available || c.cli == nil {
		return fmt.Errorf("docker unavailable")
	}
	return c.cli.ContainerStart(ctx, containerID, container.StartOptions{})
}

// Stop stops a container; timeoutSec may be nil for daemon default.
func (c *Client) Stop(ctx context.Context, containerID string, timeoutSec *int) error {
	if c == nil || !c.Available || c.cli == nil {
		return fmt.Errorf("docker unavailable")
	}
	opts := container.StopOptions{}
	if timeoutSec != nil {
		t := *timeoutSec
		opts.Timeout = &t
	}
	return c.cli.ContainerStop(ctx, containerID, opts)
}

// Restart restarts a container; timeoutSec may be nil for daemon default.
func (c *Client) Restart(ctx context.Context, containerID string, timeoutSec *int) error {
	if c == nil || !c.Available || c.cli == nil {
		return fmt.Errorf("docker unavailable")
	}
	opts := container.StopOptions{}
	if timeoutSec != nil {
		t := *timeoutSec
		opts.Timeout = &t
	}
	return c.cli.ContainerRestart(ctx, containerID, opts)
}
