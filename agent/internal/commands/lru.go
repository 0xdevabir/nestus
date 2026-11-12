package commands

import "sync"

// idLRU tracks recent command IDs for idempotency (capacity fixed).
type idLRU struct {
	mu   sync.Mutex
	cap  int
	order []string
	set  map[string]struct{}
}

func newIDLRU(capacity int) *idLRU {
	if capacity <= 0 {
		capacity = 1000
	}
	return &idLRU{
		cap: capacity,
		set: make(map[string]struct{}, capacity),
	}
}

// Seen reports whether id was already recorded; if not, records it.
func (l *idLRU) Seen(id string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if _, ok := l.set[id]; ok {
		return true
	}
	if len(l.order) >= l.cap {
		old := l.order[0]
		l.order = l.order[1:]
		delete(l.set, old)
	}
	l.order = append(l.order, id)
	l.set[id] = struct{}{}
	return false
}
