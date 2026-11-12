// Package collector periodically snapshots containers for the control plane.
package collector

import (
	"context"
	"sync"
	"time"

	nestusv1 "github.com/0xdevabir/nestus/agent/gen/nestus/v1"
	"github.com/0xdevabir/nestus/agent/internal/docker"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Sender enqueues outbound agent messages.
type Sender interface {
	Send(*nestusv1.AgentMessage) bool
}

// Collector ticks and sends ContainerSnapshot messages.
type Collector struct {
	log    zerolog.Logger
	docker *docker.Client
	sender Sender

	mu       sync.Mutex
	interval time.Duration
	ticker   *time.Ticker
	stopCh   chan struct{}
	doneCh   chan struct{}
	running  bool
}

// New creates a collector. interval is the initial tick period.
func New(log zerolog.Logger, d *docker.Client, sender Sender, interval time.Duration) *Collector {
	if interval <= 0 {
		interval = 15 * time.Second
	}
	return &Collector{
		log:      log.With().Str("component", "collector").Logger(),
		docker:   d,
		sender:   sender,
		interval: interval,
	}
}

// Start begins the ticker loop. Safe to call once.
func (c *Collector) Start(ctx context.Context) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.running {
		return
	}
	c.running = true
	c.stopCh = make(chan struct{})
	c.doneCh = make(chan struct{})
	c.ticker = time.NewTicker(c.interval)
	go c.loop(ctx)
}

// Stop ends the ticker and waits for the loop to exit.
func (c *Collector) Stop() {
	c.mu.Lock()
	if !c.running {
		c.mu.Unlock()
		return
	}
	close(c.stopCh)
	if c.ticker != nil {
		c.ticker.Stop()
	}
	done := c.doneCh
	c.running = false
	c.mu.Unlock()
	<-done
}

// SetInterval updates the snapshot period (from HelloAck / ConfigUpdate).
func (c *Collector) SetInterval(d time.Duration) {
	if d <= 0 {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.interval = d
	if c.ticker != nil {
		c.ticker.Reset(d)
	}
}

// SnapshotOnce collects and sends a single snapshot.
func (c *Collector) SnapshotOnce(ctx context.Context) {
	var containers []*nestusv1.ContainerInfo
	if c.docker != nil && c.docker.Available {
		list, err := c.docker.ListContainers(ctx)
		if err != nil {
			c.log.Warn().Err(err).Msg("list containers failed")
			containers = nil
		} else {
			containers = list
		}
	}
	msg := &nestusv1.AgentMessage{
		MsgId:  uuid.NewString(),
		SentAt: timestamppb.Now(),
		Payload: &nestusv1.AgentMessage_Containers{
			Containers: &nestusv1.ContainerSnapshot{Containers: containers},
		},
	}
	if !c.sender.Send(msg) {
		c.log.Debug().Msg("snapshot dropped: send queue full or closed")
	}
}

func (c *Collector) loop(ctx context.Context) {
	defer close(c.doneCh)
	// Immediate first snapshot on start.
	c.SnapshotOnce(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-c.stopCh:
			return
		case <-c.ticker.C:
			c.SnapshotOnce(ctx)
		}
	}
}
