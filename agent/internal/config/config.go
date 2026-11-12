// Package config loads agent YAML/env settings and credential files.
package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"gopkg.in/yaml.v3"
)

const (
	defaultConfigPath = "/etc/nestus/agent.yaml"
	defaultDataDir    = "/var/lib/nestus"
	credsFileName     = "credentials.json"
	stateFileName     = "state.json"
)

// File is the on-disk agent.yaml shape (all fields optional).
type File struct {
	URL             string   `yaml:"url" json:"url"`
	AllowedCommands []string `yaml:"allowed_commands" json:"allowed_commands"`
}

// Credentials are persisted after successful enrollment (mode 0600).
type Credentials struct {
	AgentID     string `json:"agentId"`
	AgentSecret string `json:"agentSecret"`
	ServerID    string `json:"serverId"`
	URL         string `json:"url"`
}

// State is written by the run loop for `nestus-agent status`.
type State struct {
	Connected   bool   `json:"connected"`
	ServerID    string `json:"serverId"`
	URL         string `json:"url"`
	LastError   string `json:"lastError,omitempty"`
	UpdatedAt   string `json:"updatedAt"`
	AgentID     string `json:"agentId,omitempty"`
	ConfigPath  string `json:"configPath,omitempty"`
}

// Config is the resolved runtime configuration.
type Config struct {
	mu sync.RWMutex

	ConfigPath string
	DataDir    string
	URL        string
	// LocalAllowedCommands, when set, intersects (removes-only) with server allowlist.
	LocalAllowedCommands []string
	// EffectiveAllowedCommands is the live allowlist after HelloAck / ConfigUpdate + local removals.
	EffectiveAllowedCommands []string

	HeartbeatIntervalSec         int
	MetricsIntervalSec           int
	ContainerSnapshotIntervalSec int
}

// Paths resolves config and data directories with env overrides for non-root dev.
func Paths() (configPath, dataDir string) {
	configPath = os.Getenv("NESTUS_CONFIG")
	if configPath == "" {
		configPath = defaultConfigPath
	}
	dataDir = os.Getenv("NESTUS_DATA_DIR")
	if dataDir == "" {
		if os.Geteuid() != 0 {
			if home, err := os.UserHomeDir(); err == nil {
				dataDir = filepath.Join(home, ".local", "share", "nestus")
			} else {
				dataDir = filepath.Join("data", "nestus")
			}
		} else {
			dataDir = defaultDataDir
		}
	}
	return configPath, dataDir
}

// CredentialsPath returns the credentials.json path under the data dir.
func CredentialsPath(dataDir string) string {
	return filepath.Join(dataDir, credsFileName)
}

// StatePath returns the state.json path under the data dir.
func StatePath(dataDir string) string {
	return filepath.Join(dataDir, stateFileName)
}

// Load reads optional YAML + env and returns a Config. Missing YAML is fine.
func Load() (*Config, error) {
	configPath, dataDir := Paths()
	cfg := &Config{
		ConfigPath:                   configPath,
		DataDir:                      dataDir,
		HeartbeatIntervalSec:         15,
		MetricsIntervalSec:           30,
		ContainerSnapshotIntervalSec: 15,
	}

	if data, err := os.ReadFile(configPath); err == nil {
		var f File
		if err := yaml.Unmarshal(data, &f); err != nil {
			return nil, fmt.Errorf("parse config %s: %w", configPath, err)
		}
		cfg.URL = f.URL
		cfg.LocalAllowedCommands = append([]string(nil), f.AllowedCommands...)
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("read config %s: %w", configPath, err)
	}

	if u := os.Getenv("NESTUS_URL"); u != "" {
		cfg.URL = u
	}

	return cfg, nil
}

// ApplyServerConfig merges server AgentConfig intervals and allowlist, then applies local removals.
func (c *Config) ApplyServerConfig(heartbeat, metrics, containerSnap int32, allowed []string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if heartbeat > 0 {
		c.HeartbeatIntervalSec = int(heartbeat)
	}
	if metrics > 0 {
		c.MetricsIntervalSec = int(metrics)
	}
	if containerSnap > 0 {
		c.ContainerSnapshotIntervalSec = int(containerSnap)
	}
	c.EffectiveAllowedCommands = intersectAllowlist(allowed, c.LocalAllowedCommands)
}

// AllowedCommands returns a copy of the effective allowlist.
func (c *Config) AllowedCommands() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]string, len(c.EffectiveAllowedCommands))
	copy(out, c.EffectiveAllowedCommands)
	return out
}

// IsCommandAllowed reports whether type is in the effective allowlist.
// If the allowlist is empty (no HelloAck yet / empty server list), nothing is allowed.
func (c *Config) IsCommandAllowed(cmdType string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for _, a := range c.EffectiveAllowedCommands {
		if a == cmdType {
			return true
		}
	}
	return false
}

// HeartbeatInterval returns the current heartbeat interval in seconds.
func (c *Config) HeartbeatInterval() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.HeartbeatIntervalSec
}

// ContainerSnapshotInterval returns the container snapshot interval in seconds.
func (c *Config) ContainerSnapshotInterval() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.ContainerSnapshotIntervalSec
}

// LoadCredentials reads credentials.json.
func LoadCredentials(path string) (*Credentials, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var creds Credentials
	if err := json.Unmarshal(data, &creds); err != nil {
		return nil, fmt.Errorf("parse credentials: %w", err)
	}
	if creds.AgentID == "" || creds.AgentSecret == "" || creds.URL == "" {
		return nil, errors.New("credentials incomplete: need agentId, agentSecret, url")
	}
	return &creds, nil
}

// SaveCredentials writes credentials with mode 0600, creating parent dirs as needed.
func SaveCredentials(path string, creds *Credentials) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(creds, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// WriteState atomically writes state.json for the status command.
func WriteState(path string, st *State) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// ReadState loads state.json if present.
func ReadState(path string) (*State, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var st State
	if err := json.Unmarshal(data, &st); err != nil {
		return nil, err
	}
	return &st, nil
}

// intersectAllowlist keeps only server entries that remain after optional local removals.
// When local is empty/nil, the full server list is used.
// When local is non-empty, it is treated as an explicit keep-set (can only remove from server).
func intersectAllowlist(server, local []string) []string {
	if len(local) == 0 {
		out := make([]string, len(server))
		copy(out, server)
		return out
	}
	keep := make(map[string]struct{}, len(local))
	for _, a := range local {
		keep[a] = struct{}{}
	}
	var out []string
	for _, a := range server {
		if _, ok := keep[a]; ok {
			out = append(out, a)
		}
	}
	return out
}
