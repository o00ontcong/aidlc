# AIDLC v3 Claude command templates

These files are the source templates for the Claude Code command surface. An
installer copies `commands/aidlc.md` to `<workspace>/.claude/commands/aidlc.md`.
The command is deliberately a thin shell around the installed `aidlc` CLI;
the CLI and VS Code extension both dispatch the same `AidlcApplication`
commands and return the same typed result envelope.

The template never approves a gate, commits, merges, publishes, or sends an
external message itself. It previews through the CLI, presents the result to
the user, and stops at every `waiting-for-user` or blocked result.
