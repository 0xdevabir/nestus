package commands

import (
	"context"
	"fmt"
	"sync"
	"time"

	nestusv1 "github.com/0xdevabir/nestus/agent/gen/nestus/v1"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"google.golang.org/protobuf/types/known/structpb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Sender enqueues outbound agent messages.
type Sender interface {
	Send(*nestusv1.AgentMessage) bool
}

// Allowlist checks whether a command type may run.
type Allowlist interface {
	IsCommandAllowed(cmdType string) bool
}

// Executor runs allowlisted commands on a worker pool.
type Executor struct {
	log      zerolog.Logger
	registry *Registry
	allow    Allowlist
	sender   Sender
	lru      *idLRU

	jobs    chan *nestusv1.Command
	wg      sync.WaitGroup
	stopOnce sync.Once
	stopped  chan struct{}
}

const workerCount = 4

// NewExecutor creates an executor with 4 workers.
func NewExecutor(log zerolog.Logger, reg *Registry, allow Allowlist, sender Sender) *Executor {
	return &Executor{
		log:      log.With().Str("component", "executor").Logger(),
		registry: reg,
		allow:    allow,
		sender:   sender,
		lru:      newIDLRU(1000),
		jobs:     make(chan *nestusv1.Command, 64),
		stopped:  make(chan struct{}),
	}
}

// Start launches worker goroutines.
func (e *Executor) Start(ctx context.Context) {
	for i := 0; i < workerCount; i++ {
		e.wg.Add(1)
		go e.worker(ctx)
	}
}

// Stop closes the job queue and waits up to timeout for in-flight work.
func (e *Executor) Stop(timeout time.Duration) {
	e.stopOnce.Do(func() {
		close(e.jobs)
	})
	done := make(chan struct{})
	go func() {
		e.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(timeout):
		e.log.Warn().Dur("timeout", timeout).Msg("executor stop timed out")
	}
}

// Handle validates and enqueues a command (or sends a rejection Ack).
func (e *Executor) Handle(cmd *nestusv1.Command) {
	if cmd == nil {
		return
	}
	if cmd.CommandId == "" {
		e.nack("", "missing command_id")
		return
	}
	if e.lru.Seen(cmd.CommandId) {
		e.log.Info().Str("command_id", cmd.CommandId).Msg("duplicate command ignored")
		return
	}

	handler, ok := e.registry.Get(cmd.Type)
	if !ok {
		e.nack(cmd.CommandId, fmt.Sprintf("unknown command type %q", cmd.Type))
		return
	}
	if e.allow != nil && !e.allow.IsCommandAllowed(cmd.Type) {
		e.nack(cmd.CommandId, fmt.Sprintf("command %q not in allowlist", cmd.Type))
		return
	}
	params, err := handler.Decode(cmd.Params)
	if err != nil {
		e.nack(cmd.CommandId, fmt.Sprintf("invalid params: %v", err))
		return
	}
	// Stash decoded params by replacing Params with a normalized struct so workers can re-decode.
	// Simpler: wrap in a job that already has decoded params.
	select {
	case e.jobs <- &nestusv1.Command{
		CommandId:  cmd.CommandId,
		Type:       cmd.Type,
		Params:     mustStruct(params),
		TimeoutSec: cmd.TimeoutSec,
	}:
		// queued; Ack is sent by worker after accept
	default:
		e.nack(cmd.CommandId, "executor queue full")
	}
}

func (e *Executor) worker(ctx context.Context) {
	defer e.wg.Done()
	for cmd := range e.jobs {
		e.runOne(ctx, cmd)
	}
}

func (e *Executor) runOne(parent context.Context, cmd *nestusv1.Command) {
	handler, ok := e.registry.Get(cmd.Type)
	if !ok {
		e.nack(cmd.CommandId, "handler disappeared")
		return
	}
	params, err := handler.Decode(cmd.Params)
	if err != nil {
		e.nack(cmd.CommandId, err.Error())
		return
	}

	e.sendAck(cmd.CommandId, true, "")

	timeout := handler.DefaultTimeout
	if cmd.TimeoutSec > 0 {
		timeout = int(cmd.TimeoutSec)
	}
	ctx, cancel := context.WithTimeout(parent, time.Duration(timeout)*time.Second)
	defer cancel()

	start := time.Now()
	e.sendLog(cmd.CommandId, "stdout", fmt.Sprintf("running %s", cmd.Type))

	out, err := handler.Execute(ctx, params)
	dur := time.Since(start).Milliseconds()
	if err != nil {
		e.sendLog(cmd.CommandId, "stderr", err.Error())
		e.sendResult(cmd.CommandId, false, err.Error(), nil, dur)
		return
	}
	e.sendResult(cmd.CommandId, true, "", out, dur)
}

func (e *Executor) nack(commandID, reason string) {
	e.sendAck(commandID, false, reason)
}

func (e *Executor) sendAck(commandID string, accepted bool, reason string) {
	e.enqueue(&nestusv1.AgentMessage{
		MsgId:  uuid.NewString(),
		SentAt: timestamppb.Now(),
		Payload: &nestusv1.AgentMessage_CommandAck{
			CommandAck: &nestusv1.CommandAck{
				CommandId: commandID,
				Accepted:  accepted,
				Reason:    reason,
			},
		},
	})
}

func (e *Executor) sendLog(commandID, stream, line string) {
	e.enqueue(&nestusv1.AgentMessage{
		MsgId:  uuid.NewString(),
		SentAt: timestamppb.Now(),
		Payload: &nestusv1.AgentMessage_CommandLog{
			CommandLog: &nestusv1.CommandLog{
				CommandId: commandID,
				Stream:    stream,
				Line:      line,
				Ts:        timestamppb.Now(),
			},
		},
	})
}

func (e *Executor) sendResult(commandID string, success bool, errMsg string, output map[string]any, durationMs int64) {
	var outStruct *structpb.Struct
	if output != nil {
		outStruct, _ = structpb.NewStruct(output)
	}
	e.enqueue(&nestusv1.AgentMessage{
		MsgId:  uuid.NewString(),
		SentAt: timestamppb.Now(),
		Payload: &nestusv1.AgentMessage_CommandResult{
			CommandResult: &nestusv1.CommandResult{
				CommandId:  commandID,
				Success:    success,
				Error:      errMsg,
				Output:     outStruct,
				DurationMs: durationMs,
			},
		},
	})
}

func (e *Executor) enqueue(msg *nestusv1.AgentMessage) {
	if e.sender == nil {
		return
	}
	if !e.sender.Send(msg) {
		e.log.Warn().Msg("failed to enqueue command response")
	}
}

func mustStruct(m map[string]any) *structpb.Struct {
	if m == nil {
		return nil
	}
	s, err := structpb.NewStruct(m)
	if err != nil {
		// Fallback: drop non-representable values.
		clean := map[string]any{}
		for k, v := range m {
			switch v.(type) {
			case nil, bool, float64, string, []any, map[string]any:
				clean[k] = v
			case int:
				clean[k] = float64(v.(int))
			}
		}
		s, _ = structpb.NewStruct(clean)
	}
	return s
}
