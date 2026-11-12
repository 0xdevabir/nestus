package handlers

import (
	"context"

	nestusv1 "github.com/0xdevabir/nestus/agent/gen/nestus/v1"
	"github.com/0xdevabir/nestus/agent/internal/commands"
	"github.com/0xdevabir/nestus/agent/internal/docker"
	"github.com/0xdevabir/nestus/agent/internal/facts"
)

// RegisterSystem registers system.ping and system.info.
func RegisterSystem(reg *commands.Registry, dockerClient *docker.Client) {
	reg.Register(&commands.Handler{
		Type:           "system.ping",
		DefaultTimeout: 5,
		Decode:         commands.DecodeEmpty,
		Execute: func(ctx context.Context, _ map[string]any) (map[string]any, error) {
			return map[string]any{"pong": true}, nil
		},
	})

	reg.Register(&commands.Handler{
		Type:           "system.info",
		DefaultTimeout: 10,
		Decode:         commands.DecodeEmpty,
		Execute: func(ctx context.Context, _ map[string]any) (map[string]any, error) {
			f := facts.Collect(ctx, dockerClient)
			return hostFactsToMap(f), nil
		},
	})
}

func hostFactsToMap(f *nestusv1.HostFacts) map[string]any {
	if f == nil {
		return map[string]any{}
	}
	ips := make([]any, len(f.IpAddresses))
	for i, s := range f.IpAddresses {
		ips[i] = s
	}
	return map[string]any{
		"hostname":        f.Hostname,
		"os":              f.Os,
		"platform":        f.Platform,
		"platformVersion": f.PlatformVersion,
		"kernel":          f.Kernel,
		"arch":            f.Arch,
		"cpuCores":        float64(f.CpuCores),
		"cpuModel":        f.CpuModel,
		"memTotalBytes":   float64(f.MemTotalBytes),
		"diskTotalBytes":  float64(f.DiskTotalBytes),
		"machineId":       f.MachineId,
		"ipAddresses":     ips,
		"publicIp":        f.PublicIp,
		"dockerVersion":   f.DockerVersion,
		"agentVersion":    f.AgentVersion,
		"mode":            f.Mode,
	}
}
