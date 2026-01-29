# AGENTS.md - Coding Agent Guidelines

This document provides guidelines for AI coding agents operating in this repository.
This is a dotfiles repository containing configuration for: neovim, zsh, tmux, i3, ghostty, opencode.

## Repository Structure

```
dotfiles/
├── nvim/.config/nvim/     # Neovim configuration
│   ├── init.lua           # Entry point
│   ├── lsp/               # LSP server configs
│   └── lua/
│       ├── config/        # keymaps, options, autocmds
│       ├── core/          # lazy.nvim, utils
│       └── plugins/       # Plugin configurations
├── opencode/.config/opencode/  # Opencode AI config
│   ├── agent/             # Agent definitions
│   ├── command/           # Custom commands
│   └── plugin/            # TypeScript plugins
├── zsh/                   # Zsh configuration
├── tmux/                  # Tmux configuration
├── i3/.config/i3/         # i3 window manager
├── ghostty/.config/ghostty/   # Terminal config
└── scripts/               # Utility shell scripts
```

