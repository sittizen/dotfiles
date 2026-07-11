# Neovim Config Migration: 0.11 → 0.12

**Target directory**: `nvim.0.12/` (new, no existing files — start fresh)
**Source directory**: `nvim/`
**System Neovim**: v0.12.4

## Overview

Copy all files from `nvim/` → `nvim.0.12/`, then apply per-item migrations.
Ordered so easier/core functionality is migrated first; DAP last.

---

## Pre-Flight Bug (exists in current 0.11 config too)

### 1. Missing `config/keys.lua`
- **File**: `nvim/.config/nvim/init.lua:6`
- **Issue**: `require("config.keys")` — no file at `lua/config/keys.lua`
- **Action**: Either create (empty) or remove the line. Flag to decide.

---

## Phase 1: Core Infrastructure & Simple Plugins

### 1. Core structure — `init.lua`
- **Copy**: `nvim/.config/nvim/init.lua`
- **Migrations**:
  - [ ] Resolve missing `config.keys` require (create stub or delete line 6)
  - [ ] Verify load order works with 0.12 init semantics (unchanged on paper)
  - [ ] Check `vim.env.UV_NATIVE_TLS = "1"` still needed
  - [ ] Check `vim.g.loaded_*_provider = 0` entries still needed
  - [ ] Check `require("quick-translate")` path & API

### 2. Options — `config/options.lua`
- **Copy**: `nvim/.config/nvim/lua/config/options.lua`
- **Migrations**:
  - [ ] `vim.opt.showmode = false` — 0.12 has experimental `ui2`, check interaction
  - [ ] `vim.g.loaded_osc52 = 0` — verify still relevant, consider removing
  - [ ] Confirm `vim.schedule` clipboard hack still needed in 0.12
  - [ ] All `vim.opt.*` calls verified unchanged in 0.12

### 3. Autocmds — `config/autocmds.lua`
- **Copy**: `nvim/.config/nvim/lua/config/autocmds.lua`
- **Migrations**:
  - [ ] `TextYankPost` autocmd API unchanged
  - [ ] `vim.highlight.on_yank` API unchanged
  - [ ] Check if 0.12 `buffer`→`buf` deprecation applies (not used here)

### 4. Keymaps — `config/keymaps.lua`
- **Copy**: `nvim/.config/nvim/lua/config/keymaps.lua`
- **Migrations**:
  - [ ] **Check conflicts with 0.12 default mappings**: `grt` (LSP type def), `grx` (codelens run)
  - [ ] `vim.keymap.set` signature unchanged in 0.12
  - [ ] `vim.lsp.buf.declaration()` / `vim.lsp.buf.definition()` — verify API in 0.12
  - [ ] `temp_buf()` helper — check `vim.api.*` calls for 0.12 compatibility
  - [ ] `require("Comment.api").toggle.linewise.current` — verify API
  - [ ] `require("pysdk")` references — ensure these modules exist

### 5. Lazy loader — `core/lazy.lua`
- **Copy**: `nvim/.config/nvim/lua/core/lazy.lua`
- **Migrations**:
  - [ ] `(vim.uv or vim.loop)` fallback covers 0.12 (`vim.loop` deprecated since 0.10)
  - [ ] Consider updating to `vim.uv` only (0.12+)
  - [ ] `lazy.nvim` branch `stable` — verify works with 0.12
  - [ ] `require("lazy").setup()` spec format unchanged

### 6. Theme — `plugins/nightfox.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/nightfox.lua`
- **Migrations**:
  - [ ] **BUG**: `options = {}` should be `opts = {}` for lazy.nvim (pre-existing bug)
  - [ ] `vim.cmd("colorscheme nightfox")` — verify nightfox supports 0.12
  - [ ] `enabled = true` — redundant but harmless

### 7. Sleuth — `plugins/sleuth.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/sleuth.lua`
- **Migrations**:
  - [ ] Trivial — just plugin spec, no changes expected

### 8. Screenkey — `plugins/screenkey.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/screenkey.lua`
- **Migrations**:
  - [ ] Verify latest version supports 0.12

### 9. Mini-surround — `plugins/mini-surround.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/mini-surround.lua`
- **Migrations**:
  - [ ] Core API unchanged
  - [ ] `version = "*"` — latest release

### 10. Mini-statusline — `plugins/mini-statusline.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/mini-statusline.lua`
- **Migrations**:
  - [ ] Core API unchanged
  - [ ] CONSIDER: 0.12 has new default statusline with diagnostic/vim.ui.progress — may prefer built-in

### 11. Mini-notify — `plugins/mini-notify.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/mini-notify.lua`
- **Migrations**:
  - [ ] Currently disabled (commented out setup) — decide to enable or drop
  - [ ] 0.12 has experimental `ui2` with enhanced messaging

### 12. Comment — `plugins/comment.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/comment.lua`
- **Migrations**:
  - [ ] Comment.nvim API unchanged
  - [ ] Note: `opts` has extra `{}` wrapper (possible pre-existing bug but works)

### 13. Which-key — `plugins/which-key.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/which-key.lua`
- **Migrations**:
  - [ ] `folke/which-key.nvim` — verify 0.12 compatibility
  - [ ] `vim.g.have_nerd_font` config style unchanged

### 14. Blame — `plugins/blame.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/blame.lua`
- **Migrations**:
  - [ ] Trivial — verify `FabijanZulj/blame.nvim` 0.12 support

---

## Phase 2: Core Editing Plugins

### 15. Treesitter — `plugins/treesitter.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/treesitter.lua`
- **Migrations**:
  - [ ] `nvim-treesitter/nvim-treesitter` — verify latest supports 0.12
  - [ ] `nvim-treesitter-textobjects` — verify compatibility
  - [ ] 0.12 removed `Query:iter_matches()` "all" option (not used here, but good to know)
  - [ ] 0.12 enables treesitter markdown by default — may conflict or be redundant
  - [ ] `ensure_installed` parsers list — verify all parsers available
  - [ ] Textobjects keymaps — verify API unchanged
  - [ ] 0.12 has new `vim.treesitter.select()` for incremental selection

### 16. Telescope — `plugins/telescope.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/telescope.lua`
- **Migrations**:
  - [ ] `nvim-telescope/telescope.nvim` — branch `0.1.x`, verify 0.12 compat
  - [ ] `telescope-fzf-native.nvim` — build with `make`, verify
  - [ ] `telescope-ui-select.nvim` — verify 0.12 compat
  - [ ] `nvim-web-devicons` — verify
  - [ ] 0.12 API changes: `buffer`→`buf` in autocmd opts (not used here directly)
  - [ ] Keymaps (`<leader>sh`, `<leader>sf`, etc.) unchanged
  - [ ] Consider using 0.12 built-in `vim.lsp.buf.workspace_diagnostics()` in diagnostics picker

### 17. Harpoon — `plugins/harpoon.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/harpoon.lua`
- **Migrations**:
  - [ ] `ThePrimeagen/harpoon` harpoon2 branch — verify 0.12 support
  - [ ] Keymap API unchanged

### 18. Blink (autocomplete) — `plugins/blink.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/blink.lua`
- **Migrations**:
  - [ ] `saghen/blink.cmp` — verify latest supports 0.12
  - [ ] 0.12 adds native `autocomplete` option — blink may need config updates
  - [ ] 0.12 adds `vim.lsp.completion.enable()` with `cmp` option
  - [ ] 0.12 adds `textDocument/inlineCompletion` — blink may already support
  - [ ] `friendly-snippets` dependency — verify
  - [ ] `keymap = { preset = "super-tab" }` — check 0.12 keymap changes

### 19. Conform (formatting) — `plugins/conform.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/conform.lua`
- **Migrations**:
  - [ ] `stevearc/conform.nvim` — verify 0.12 compat
  - [ ] `formatters_by_ft` config unchanged
  - [ ] `BufWritePre` autocmd — `args.buf` is correct (provided by autocmd callback)
  - [ ] `ruff` formatter config — verify `ruff_format` still correct (vs `ruff`)

### 20. Quicker — `plugins/quicker.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/quicker.lua`
- **Migrations**:
  - [ ] `stevearc/quicker.nvim` — verify 0.12 compat
  - [ ] `ft = "qf"` — correct
  - [ ] Keys (`>`, `<`) expand/collapse API unchanged

---

## Phase 3: LSP Infrastructure

### 21. LSP Core — `core/lsp.lua`
- **Copy**: `nvim/.config/nvim/lua/core/lsp.lua`
- **Migrations**:
  - [ ] **0.12 breakage**: `vim.lsp.enable()` enhanced — now auto start/stops clients, detaches non-applicable. Verify configs still work
  - [ ] **0.12 breakage**: LSP JSON null → `vim.NIL` — check diagnostic handlers
  - [ ] `vim.diagnostic.config()` already uses `signs.text` (correct, avoids 0.12-removed `sign_define`)
  - [ ] `virtual_lines = true` — verify still supported (was relatively new)
  - [ ] Diagnostic signs with `numhl` — verify format in 0.12
  - [ ] `vim.lsp.log.set_level("error")` — unchanged API
  - [ ] Toggle diagnostics keymap (`<leader>ix`) — verify `vim.diagnostic.config()` toggle works
  - [ ] 0.12 adds `vim.diagnostic.status()` — could integrate into statusline

### 22. LSP Config: lua_ls — `lsp/lua_ls.lua`
- **Copy**: `nvim/.config/nvim/lsp/lua_ls.lua`
- **Migrations**:
  - [ ] Verify `vim.lsp.Config` format in 0.12 — `cmd`, `filetypes`, `root_markers`, `settings` fields
  - [ ] `settings.Lua.diagnostics.disable.undefined-global` — verify format
  - [ ] `single_file_support = true` — unchanged
  - [ ] `log_level` using `vim.lsp.protocol.MessageType.Warning` — verify in 0.12

### 23. LSP Config: pyright — `lsp/pyright.lua`
- **Copy**: `nvim/.config/nvim/lsp/pyright.lua`
- **Migrations**:
  - [ ] **0.12 breakage risk**: `on_attach` modifies `client.settings` — 0.12 has stricter config validation
  - [ ] JSON null `vim.NIL` change — could affect pyright server responses
  - [ ] `vim.lsp.rpc.connect` (commented out) — verify remote connect API
  - [ ] `root_markers` list — verify
  - [ ] `find_venv()` logic — works with `vim.fn.isdirectory`
  - [ ] Extra paths include python 3.10–3.14 — update if needed
  - [ ] `vim.lsp.protocol.MessageType` in `log_level` — verify in 0.12

### 24. LSP Config: gopls — `lsp/gopls.lua`
- **Copy**: `nvim/.config/nvim/lsp/gopls.lua`
- **Migrations**:
  - [ ] `cmd = { "gopls" }` — verify gopls version
  - [ ] `single_file_support = true` — unchanged
  - [ ] `log_level` — verify

### 25. LSP Config: bashls — `lsp/bashls.lua`
- **Copy**: `nvim/.config/nvim/lsp/bashls.lua`
- **Migrations**:
  - [ ] `bash-language-server` — verify works with 0.12 LSP
  - [ ] `$GLOB_PATTERN` env var — verify

### 26. LSP Config: ty — `lsp/ty.lua`
- **Copy**: `nvim/.config/nvim/lsp/ty.lua`
- **Migrations**:
  - [ ] Currently commented out in `vim.lsp.enable()` — decide to enable or drop
  - [ ] `ty` (astral-sh/ty) — verify latest supports 0.12 LSP protocol

### 27. scutils — `lua/scutils.lua`
- **Copy**: `nvim/.config/nvim/lua/scutils.lua`
- **Migrations**:
  - [ ] **0.12 breakage risk**: `vim.lsp.buf_request_sync` returns — JSON null now `vim.NIL`
  - [ ] `vim.lsp.util.make_text_document_params()` — verify API in 0.12
  - [ ] `vim.lsp.protocol.SymbolKind` — verify enum values in 0.12
  - [ ] `vim.lsp.buf_request_sync` timeout of 1000ms — consider adjusting

### 28. Core utils — `lua/core/utils.lua`
- **Copy**: `nvim/.config/nvim/lua/core/utils.lua`
- **Migrations**:
  - [ ] No LSP calls, just bufname/path helpers — unchanged
  - [ ] Verify `vim.fn.expand` behavior in 0.12

---

## Phase 4: Markdown, File Browsing, and Other Plugins

### 29. Render-markdown — `plugins/render-markdown.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/render-markdown.lua`
- **Migrations**:
  - [ ] 0.12 enables treesitter markdown by default — may affect render-markdown behavior
  - [ ] `MeanderingProgrammer/render-markdown.nvim` — verify 0.12 compat
  - [ ] `cond` check using `core.utils.is_in_render_md_allowed_dir()` — verify

### 30. Diagram — `plugins/diagram.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/diagram.lua`
- **Migrations**:
  - [ ] `3rd/diagram.nvim` — verify 0.12 compat
  - [ ] `3rd/image.nvim` — verify 0.12 TUI compat
  - [ ] `mermaid` renderer — verify CLI args work
  - [ ] `events.render_buffer` — verify autocmd format
  - [ ] `<leader>im` keymap — verify

### 31. Oil — `plugins/oil.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/oil.lua`
- **Migrations**:
  - [ ] `stevearc/oil.nvim` — verify 0.12 compat
  - [ ] `mini.icons` dependency — verify
  - [ ] `lazy = false` — verify still recommended

### 32. Obsidian — `plugins/obsidian.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/obsidian.lua`
- **Migrations**:
  - [ ] `epwalsh/obsidian.nvim` — verify 0.12 compat
  - [ ] `plenary.nvim` dependency — verify
  - [ ] Workspace config `~/workspace/work-vault` — verify path exists
  - [ ] `ui.enable = false` — check if 0.12 affects UI toggling

### 33. Quick-translate — `plugins/quick-translate.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/quick-translate.lua`
- **Migrations**:
  - [ ] Custom local plugin — `dir = "~/workspace/dotfiles/plugins/quick-translate/lua/quick-translate"`
  - [ ] Also referenced in `init.lua` with `vim.opt.runtimepath:append()` + `require("quick-translate").setup()`
  - [ ] Verify 0.12 `vim.opt.runtimepath` behavior same

### 34. Snacks — `plugins/snacks.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/snacks.lua`
- **Migrations**:
  - [ ] `folke/snacks.nvim` — verify 0.12 compat
  - [ ] Many features disabled: `picker`, `bigfile`, `dashboard`, `explorer`, `image`, `notifier`, etc.
  - [ ] `terminal.enabled = true` — check 0.12 terminal API
  - [ ] `input.enabled = true` — check 0.12 `vim.ui.input` changes
  - [ ] `toggle.enabled = true` — verify

---

## Phase 5: DAP Debugger (Last)

### 35. DAP — `plugins/dap.lua`
- **Copy**: `nvim/.config/nvim/lua/plugins/dap.lua`
- **Migrations**:
  - [ ] `mfussenegger/nvim-dap` — verify 0.12 compat
  - [ ] `mfussenegger/nvim-dap-python` — verify 0.12 compat
  - [ ] `rcarriga/nvim-dap-ui` — verify 0.12 compat
  - [ ] `theHamsta/nvim-dap-virtual-text` — verify 0.12 compat
  - [ ] `nvim-neotest/nvim-nio` — verify 0.12 compat
  - [ ] **Not affected by diagnostic `sign_define` removal** — DAP signs use `vim.fn.sign_define()` which is separate from diagnostic signs
  - [ ] `dap.listeners.before.event_exited["dapui_config"]` — verify event names in 0.12
  - [ ] `resolve_python()` logic — verify `vim.fn.executable` works
  - [ ] Remote attach config — verify `vim.env.*` var access
  - [ ] Debugpy `pathMappings` — `vim.fn.getcwd()` for localRoot
  - [ ] `DapBreakpoint`, `DapStopped` sign definitions — verify `vim.fn.sign_define` API in 0.12

---

## Verification Commands

After each phase, run:

```bash
# Basic syntax check
nvim --headless -c "lua vim.cmd('q')" -c "qa"

# With the new config
XDG_CONFIG_HOME="$PWD/nvim.0.12/.config" nvim --headless -c "lua vim.cmd('q')" -c "qa"

# Check for errors
XDG_CONFIG_HOME="$PWD/nvim.0.12/.config" nvim --headless -c "lua vim.cmd('q')" -c "qa" 2>&1 | grep -i error

# LSP health
XDG_CONFIG_HOME="$PWD/nvim.0.12/.config" nvim --headless -c "checkhealth vim.lsp" -c "qa"
```

---

## 0.12-Breaking Changes Reference (from news.txt)

| Change | Severity | Affects Our Config? |
|--------|----------|---------------------|
| JSON null → `vim.NIL` in LSP messages | **HIGH** | `scutils.lua`, `lsp/pyright.lua` |
| `vim.lsp.enable()` enhanced semantics | **MEDIUM** | `core/lsp.lua`, all `lsp/*.lua` |
| `vim.diff` → `vim.text.diff` | LOW | Not used |
| `buffer` → `buf` in autocmd opts | LOW | Not used |
| Diagnostic `sign_define` removed | NONE | Already using `vim.diagnostic.config({signs={...}})` |
| Treesitter `iter_matches("all")` removed | NONE | Not used |
| Default `grt`/`grx` mappings | LOW | Check for conflicts |
| Default statusline with diagnostics | NONE | Already using mini.statusline (overrides) |
| `vim.lsp.buf.rename()` highlights | NONE | New feature, no action needed |
| LSP `textDocument/codeLens` reimplemented | NONE | Not used |
| `vim.lsp.codelens.*` deprecations | NONE | Not used |
| `client.attached_buffers[buf]` → `languageId` string | NONE | Not accessed in our config |
| `nvim_set_hl()` partial updates | NONE | Not used |
