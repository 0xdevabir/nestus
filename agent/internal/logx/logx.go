// Package logx configures the agent's zerolog logger: JSON in non-TTY,
// pretty console output when attached to a terminal.
package logx

import (
	"os"
	"time"

	"github.com/rs/zerolog"
)

// Setup configures zerolog and returns the root logger.
func Setup() zerolog.Logger {
	if isTTY(os.Stderr) {
		out := zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339}
		return zerolog.New(out).With().Timestamp().Logger()
	}
	return zerolog.New(os.Stderr).With().Timestamp().Logger()
}

func isTTY(f *os.File) bool {
	info, err := f.Stat()
	if err != nil {
		return false
	}
	return info.Mode()&os.ModeCharDevice != 0
}
