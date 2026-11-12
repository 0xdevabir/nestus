package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/0xdevabir/nestus/agent/internal/logx"
	"github.com/0xdevabir/nestus/agent/internal/version"
	"github.com/rs/zerolog"
	"github.com/spf13/cobra"
)

var (
	verbose bool
	logger  zerolog.Logger
)

func main() {
	root := &cobra.Command{
		Use:           "nestus-agent",
		Short:         "NESTUS execution-plane agent: connects your server to the control plane",
		Version:       fmt.Sprintf("%s (commit %s, built %s)", version.Version, version.Commit, version.BuildDate),
		SilenceUsage:  true,
		SilenceErrors: true,
		PersistentPreRun: func(_ *cobra.Command, _ []string) {
			if verbose {
				zerolog.SetGlobalLevel(zerolog.DebugLevel)
			} else {
				zerolog.SetGlobalLevel(zerolog.InfoLevel)
			}
			logger = logx.Setup()
		},
	}
	root.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "enable debug logging")

	root.AddCommand(
		newVersionCommand(),
		newRunCommand(),
		newEnrollCommand(),
	)

	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func newVersionCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print the agent version",
		Run: func(*cobra.Command, []string) {
			fmt.Printf("nestus-agent %s (commit %s, built %s)\n", version.Version, version.Commit, version.BuildDate)
		},
	}
}

func newRunCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "run",
		Short: "Connect to the control plane and process commands",
		RunE: func(_ *cobra.Command, _ []string) error {
			ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
			defer stop()

			logger.Info().Str("version", version.Version).Msg("agent starting")
			// TODO(Phase 3): enroll with the control plane, dial the gRPC
			// bidi stream and process typed commands.

			<-ctx.Done()
			logger.Info().Msg("shutting down")
			return nil
		},
	}
}

func newEnrollCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "enroll",
		Short: "Enroll this server with the NESTUS control plane",
		RunE: func(_ *cobra.Command, _ []string) error {
			// TODO(Phase 3): POST to the control plane enroll endpoint,
			// store the issued agent token locally.
			logger.Info().Msg("enroll: not implemented yet (Phase 3)")
			return nil
		},
	}
	return cmd
}
