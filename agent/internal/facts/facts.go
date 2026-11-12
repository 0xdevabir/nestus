// Package facts collects HostFacts for enroll and Hello.
package facts

import (
	"context"
	"net"
	"os"
	"runtime"
	"strings"
	"time"

	nestusv1 "github.com/0xdevabir/nestus/agent/gen/nestus/v1"
	"github.com/0xdevabir/nestus/agent/internal/docker"
	"github.com/0xdevabir/nestus/agent/internal/version"
	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
)

// Collect gathers host facts. dockerClient may be nil.
func Collect(ctx context.Context, dockerClient *docker.Client) *nestusv1.HostFacts {
	facts := &nestusv1.HostFacts{
		Arch:         runtime.GOARCH,
		Os:           runtime.GOOS,
		AgentVersion: version.Version,
		Mode:         "docker",
	}

	if hi, err := host.InfoWithContext(ctx); err == nil && hi != nil {
		facts.Hostname = hi.Hostname
		facts.Platform = hi.Platform
		facts.PlatformVersion = hi.PlatformVersion
		facts.Kernel = hi.KernelVersion
		facts.MachineId = hi.HostID
		if facts.Os == "" {
			facts.Os = hi.OS
		}
	}
	if facts.Hostname == "" {
		facts.Hostname, _ = os.Hostname()
	}

	if cores, err := cpu.CountsWithContext(ctx, true); err == nil {
		facts.CpuCores = int32(cores)
	}
	if infos, err := cpu.InfoWithContext(ctx); err == nil && len(infos) > 0 {
		facts.CpuModel = strings.TrimSpace(infos[0].ModelName)
	}

	if vm, err := mem.VirtualMemoryWithContext(ctx); err == nil && vm != nil {
		facts.MemTotalBytes = vm.Total
	}

	if usage, err := disk.UsageWithContext(ctx, "/"); err == nil && usage != nil {
		facts.DiskTotalBytes = usage.Total
	}

	facts.IpAddresses = localIPs()
	facts.PublicIp = publicIP(ctx)

	if dockerClient != nil {
		facts.DockerVersion = dockerClient.Version(ctx)
	}

	return facts
}

func localIPs() []string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}
	var ips []string
	seen := map[string]struct{}{}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() {
				continue
			}
			v4 := ip.To4()
			if v4 == nil {
				continue
			}
			s := v4.String()
			if _, ok := seen[s]; ok {
				continue
			}
			seen[s] = struct{}{}
			ips = append(ips, s)
		}
	}
	return ips
}

func publicIP(ctx context.Context) string {
	// Best-effort UDP dial trick — no packets need to leave; OS picks outbound IP.
	d := net.Dialer{Timeout: 2 * time.Second}
	conn, err := d.DialContext(ctx, "udp", "1.1.1.1:80")
	if err != nil {
		return ""
	}
	defer conn.Close()
	if addr, ok := conn.LocalAddr().(*net.UDPAddr); ok && addr.IP != nil {
		if v4 := addr.IP.To4(); v4 != nil {
			return v4.String()
		}
	}
	return ""
}
