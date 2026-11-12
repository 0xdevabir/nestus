package commands

import (
	"context"
	"encoding/json"
	"fmt"

	"google.golang.org/protobuf/types/known/structpb"
)

// HandlerFunc executes a typed command and returns output fields for CommandResult.
type HandlerFunc func(ctx context.Context, params map[string]any) (map[string]any, error)

// Handler is a registered command type.
type Handler struct {
	Type           string
	DefaultTimeout int // seconds
	// Decode validates/normalizes params into a map the handler accepts.
	Decode  func(params *structpb.Struct) (map[string]any, error)
	Execute HandlerFunc
}

// Registry maps command type → handler.
type Registry struct {
	handlers map[string]*Handler
}

// NewRegistry builds an empty registry.
func NewRegistry() *Registry {
	return &Registry{handlers: make(map[string]*Handler)}
}

// Register adds a handler.
func (r *Registry) Register(h *Handler) {
	r.handlers[h.Type] = h
}

// Get returns the handler for type, if any.
func (r *Registry) Get(cmdType string) (*Handler, bool) {
	h, ok := r.handlers[cmdType]
	return h, ok
}

// Types returns all registered command type names.
func (r *Registry) Types() []string {
	out := make([]string, 0, len(r.handlers))
	for t := range r.handlers {
		out = append(out, t)
	}
	return out
}

// structToMap converts a protobuf Struct to a plain map (nil → empty).
func structToMap(s *structpb.Struct) map[string]any {
	if s == nil {
		return map[string]any{}
	}
	return s.AsMap()
}

// DecodeEmpty accepts empty/nil params.
func DecodeEmpty(params *structpb.Struct) (map[string]any, error) {
	return structToMap(params), nil
}

// DecodeContainerID requires containerId string.
func DecodeContainerID(params *structpb.Struct) (map[string]any, error) {
	m := structToMap(params)
	id, _ := m["containerId"].(string)
	if id == "" {
		return nil, fmt.Errorf("containerId is required")
	}
	return map[string]any{"containerId": id}, nil
}

// DecodeContainerAction requires containerId and optional timeoutSec.
func DecodeContainerAction(params *structpb.Struct) (map[string]any, error) {
	m := structToMap(params)
	id, _ := m["containerId"].(string)
	if id == "" {
		return nil, fmt.Errorf("containerId is required")
	}
	out := map[string]any{"containerId": id}
	if v, ok := m["timeoutSec"]; ok {
		switch t := v.(type) {
		case float64:
			if t > 0 {
				out["timeoutSec"] = int(t)
			}
		case json.Number:
			n, err := t.Int64()
			if err == nil && n > 0 {
				out["timeoutSec"] = int(n)
			}
		}
	}
	return out, nil
}

// StringParam reads a string from decoded params.
func StringParam(m map[string]any, key string) string {
	v, _ := m[key].(string)
	return v
}

// IntParam reads an optional int from decoded params.
func IntParam(m map[string]any, key string) *int {
	v, ok := m[key]
	if !ok {
		return nil
	}
	switch t := v.(type) {
	case int:
		return &t
	case float64:
		i := int(t)
		return &i
	default:
		return nil
	}
}
