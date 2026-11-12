package handlers

import (
	"context"
	"fmt"

	"github.com/0xdevabir/nestus/agent/internal/commands"
	"github.com/0xdevabir/nestus/agent/internal/docker"
)

// RegisterDocker registers docker.* command handlers.
func RegisterDocker(reg *commands.Registry, dockerClient *docker.Client) {
	reg.Register(&commands.Handler{
		Type:           "docker.list",
		DefaultTimeout: 15,
		Decode:         commands.DecodeEmpty,
		Execute: func(ctx context.Context, _ map[string]any) (map[string]any, error) {
			if dockerClient == nil || !dockerClient.Available {
				return nil, fmt.Errorf("docker unavailable")
			}
			list, err := dockerClient.ListContainers(ctx)
			if err != nil {
				return nil, err
			}
			items := make([]any, 0, len(list))
			for _, c := range list {
				ports := make([]any, len(c.Ports))
				for i, p := range c.Ports {
					ports[i] = p
				}
				networks := make([]any, len(c.Networks))
				for i, n := range c.Networks {
					networks[i] = n
				}
				labels := map[string]any{}
				for k, v := range c.Labels {
					labels[k] = v
				}
				items = append(items, map[string]any{
					"id":           c.Id,
					"name":         c.Name,
					"image":        c.Image,
					"state":        c.State,
					"status":       c.Status,
					"health":       c.Health,
					"createdUnix":  float64(c.CreatedUnix),
					"restartCount": float64(c.RestartCount),
					"labels":       labels,
					"ports":        ports,
					"networks":     networks,
					"ipAddress":    c.IpAddress,
				})
			}
			return map[string]any{"containers": items}, nil
		},
	})

	reg.Register(&commands.Handler{
		Type:           "docker.inspect",
		DefaultTimeout: 15,
		Decode:         commands.DecodeContainerID,
		Execute: func(ctx context.Context, params map[string]any) (map[string]any, error) {
			if dockerClient == nil || !dockerClient.Available {
				return nil, fmt.Errorf("docker unavailable")
			}
			id := commands.StringParam(params, "containerId")
			return dockerClient.Inspect(ctx, id)
		},
	})

	reg.Register(&commands.Handler{
		Type:           "docker.start",
		DefaultTimeout: 60,
		Decode:         commands.DecodeContainerAction,
		Execute: func(ctx context.Context, params map[string]any) (map[string]any, error) {
			if dockerClient == nil || !dockerClient.Available {
				return nil, fmt.Errorf("docker unavailable")
			}
			id := commands.StringParam(params, "containerId")
			if err := dockerClient.Start(ctx, id); err != nil {
				return nil, err
			}
			return map[string]any{"containerId": id, "action": "start"}, nil
		},
	})

	reg.Register(&commands.Handler{
		Type:           "docker.stop",
		DefaultTimeout: 60,
		Decode:         commands.DecodeContainerAction,
		Execute: func(ctx context.Context, params map[string]any) (map[string]any, error) {
			if dockerClient == nil || !dockerClient.Available {
				return nil, fmt.Errorf("docker unavailable")
			}
			id := commands.StringParam(params, "containerId")
			timeout := commands.IntParam(params, "timeoutSec")
			if err := dockerClient.Stop(ctx, id, timeout); err != nil {
				return nil, err
			}
			return map[string]any{"containerId": id, "action": "stop"}, nil
		},
	})

	reg.Register(&commands.Handler{
		Type:           "docker.restart",
		DefaultTimeout: 90,
		Decode:         commands.DecodeContainerAction,
		Execute: func(ctx context.Context, params map[string]any) (map[string]any, error) {
			if dockerClient == nil || !dockerClient.Available {
				return nil, fmt.Errorf("docker unavailable")
			}
			id := commands.StringParam(params, "containerId")
			timeout := commands.IntParam(params, "timeoutSec")
			if err := dockerClient.Restart(ctx, id, timeout); err != nil {
				return nil, err
			}
			return map[string]any{"containerId": id, "action": "restart"}, nil
		},
	})
}
