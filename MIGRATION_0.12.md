# Neovim 0.11 -> 0.12 Treesitter Migration

Followed plan to fix treesitter crash after upgrading Neovim 0.11 -> 0.12.4.
Reproducible on any laptop with this dotfiles config.

## Symptom

After upgrading Neovim to 0.12.x, opening a markdown file (or any buffer with
treesitter injections) crashes:

```
Lua: .../share/nvim/runtime/lua/vim/treesitter/languagetree.lua:215:
.../share/nvim/runtime/lua/vim/treesitter.lua:197:
attempt to call method 'range' (a nil value)
stack traceback:
        [C]: in function 'f'
        .../lua/vim/treesitter/languagetree.lua:215: in function 'tcall'
        .../lua/vim/treesitter/languagetree.lua:596: in function 'parse'
        .../lua/vim/treesitter/highlighter.lua:580: in function <...>
```

Triggered the moment a markdown buffer with fenced code blocks is rendered
(image.nvim markdown integration is what surfaced it here, but any
treesitter-highlighted markdown hits it).

## Root cause

`nvim-treesitter` `master` branch is **archived/frozen** (commit
`42fc28ba docs(readme)!: announce archiving of master branch`) and is
incompatible with Neovim 0.12.

Chain:

1. Neovim 0.12 removed the `all` option to `Query:iter_matches()`
   (see `:h news-breaking` / `news.txt`). `match[capture_id]` now always
   returns a `TSNode[]` list, never a single `TSNode`.
2. Plugin's `lua/nvim-treesitter/query_predicates.lua:141`
   (`set-lang-from-info-string!` directive) does
   `local node = match[capture_id]` then `vim.treesitter.get_node_text(node, bufnr)`.
   It expects a single node, receives a list.
3. `get_node_text` -> `get_range` -> `node:range(true)` is called on a Lua
   table; `range` is nil -> crash.
4. Triggered by `queries/markdown/injections.scm:5`
   `(#set-lang-from-info-string! @_lang)` on every markdown buffer with a
   fenced code block. The plugin's compatibility shim
   `opts = { force = true, all = false }` (commit `3826d0c4`) is a no-op on
   0.12 since `all` is gone.
5. `master` will NOT be fixed. Maintained branch is `main` (full, incompatible
   rewrite requiring Neovim 0.12). Same for `nvim-treesitter-textobjects`
   (`master` frozen, `main` is the rewrite).

## Prerequisites

- Neovim 0.12.0+ (`nvim --version`).
- `tree-sitter` CLI v0.26.1+ in `$PATH`. The `main` branch uses it to
  build parsers (`tree-sitter generate` + `tree-sitter build`). The old
  `master` branch compiled parsers with plain `cc` and did not need the CLI.
- A C compiler (`gcc`/`cc`) in `$PATH`.
- `tar` and `curl` in `$PATH`.

### Installing the tree-sitter CLI

If `tree-sitter --version` is missing:

- Preferred: download a prebuilt binary from
  https://github.com/tree-sitter/tree-sitter/releases/latest
  (asset `tree-sitter-linux-x64.gz` on x86_64 Linux), gunzip, place on `$PATH`
  (e.g. `~/.local/bin/tree-sitter`, `chmod +x`).
- `cargo install tree-sitter-cli --locked` works only with Cargo >= 1.85
  (needs the `edition2024` feature). On older toolchains use the prebuilt
  binary instead.

The config prepends `~/.local/bin` and `~/.cargo/bin` to `PATH` (see step 3),
so placing the binary in either is sufficient.

## Plan

### 1. Switch both plugins to the `main` branch

In the lazy data dir (`~/.local/share/nvim/lazy/` by default):

```sh
cd ~/.local/share/nvim/lazy/nvim-treesitter
git fetch origin main
git checkout main
git pull origin main

cd ~/.local/share/nvim/lazy/nvim-treesitter-textobjects
git fetch origin main
git checkout main
git pull origin main
```

Doing this before the first headless run avoids a chicken-and-egg: lazy only
switches branches after loading the spec, but the spec's `config` function
runs against the still-`master` checkout on the first launch and errors.

### 2. Rewrite `lua/plugins/treesitter.lua`

The `main` branch has no `nvim-treesitter.configs`. New API:

- `require('nvim-treesitter').setup({})` for plugin config.
- `require('nvim-treesitter').install({...})` to install parsers (async;
  call `:wait(ms)` for synchronous install). Replaces `ensure_installed`.
- `vim.treesitter.start(buf)` in a `FileType` autocmd for highlighting.
- `vim.bo[buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"`
  for indentation.
- Injections need no setup.
- `nvim-treesitter-textobjects` gets its own `require('nvim-treesitter-textobjects').setup({})`
  plus explicit keymaps via `select.select_textobject(query, group)` and
  `move.goto_next_start(query, group)` / `goto_previous_start` / etc.

See the final `lua/plugins/treesitter.lua` in this repo for the exact spec
(two plugin specs in one returned table). It preserves the original
select keymaps (af/if/ac/ic/is/ai/ii/al/il/aa/ia) and move keymaps
([f/]f/[c/]c/[p/]p) using the new API.

Note: textobjects `select` no longer takes a `keymaps` table; all keymaps
must be set manually with `vim.keymap.set`.

### 3. Prepend bin dirs to PATH in `init.lua`

So Neovim subprocesses can find `tree-sitter` / `cargo` binaries:

```lua
vim.env.PATH = (vim.env.HOME .. "/.local/bin:")
  .. (vim.env.HOME .. "/.cargo/bin:")
  .. (vim.env.PATH or "")
```

Add this near the top of `init.lua`, before `require("core.lazy")`.

### 4. Update `lazy-lock.json`

Flip both entries to `branch = "main"` with the new commit hashes. Lazy
will update this automatically after a successful `:Lazy! sync`, but it can
also be edited by hand:

```json
"nvim-treesitter": { "branch": "main", "commit": "<main HEAD>" },
"nvim-treesitter-textobjects": { "branch": "main", "commit": "<main HEAD>" },
```

### 5. Rebuild parsers

Old `master`-built parsers live in
`~/.local/share/nvim/lazy/nvim-treesitter/parser/*.so` and are NOT reused by
`main`. The `main` branch installs to
`~/.local/share/nvim/site/parser/<lang>.so`.

Either:

- Let `build = ":TSUpdate"` + the `install({...})` call in the spec build
  them on first launch (headless example below), or
- Run `:TSInstall lua vim vimdoc query javascript html python bash fish markdown markdown_inline`
  inside Neovim.

Headless build + verification:

```sh
nvim --headless -u ~/.config/nvim/init.lua \
  +'lua local t=require("nvim-treesitter").install({"lua","vim","vimdoc","query","javascript","html","python","bash","fish","markdown","markdown_inline"}); local ok,err=t:wait(360000); print("INSTALL wait ok=",ok," err=",err)' \
  +qa
```

### 6. Cleanup (optional)

Old master-built parsers are now unused and can be removed:

```sh
rm -rf ~/.local/share/nvim/lazy/nvim-treesitter/parser
rm -rf ~/.local/share/nvim/lazy/nvim-treesitter/parser-info
```

## Verification

1. No crash on a markdown buffer with a fenced code block:

```sh
cat > /tmp/test.md <<'EOF'
# Title

```lua
print("hello")
```
EOF
nvim --headless -u ~/.config/nvim/init.lua /tmp/test.md \
  -c "lua vim.wait(4000, function() return false end)" -c "qa"
# expect: exit 0, no "attempt to call method 'range'" error
```

2. Highlighter active and injections parse:

```sh
nvim --headless -u ~/.config/nvim/init.lua /tmp/test.md \
  +'lua vim.wait(1500, function() return false end)' \
  +'lua local b=vim.api.nvim_get_current_buf(); local H=vim.treesitter.highlighter.active; print("highlighter active=", H[b] ~= nil); local p=vim.treesitter.get_parser(b,"markdown"); p:parse(true); local inj=p:children(); local langs={}; for k in pairs(inj) do langs[#langs+1]=k end; print("injection children=", table.concat(langs,",")); local lp=vim.treesitter.get_parser(b,"lua"); if lp then lp:parse(true); print("lua injection parsed OK") end' \
  +qa
# expect: highlighter active= true ; injection children= lua,markdown_inline ; lua injection parsed OK
```

3. Textobjects loaded:

```sh
nvim --headless -u ~/.config/nvim/init.lua /tmp/test.md \
  +'lua print("select loaded=", require("nvim-treesitter-textobjects.select").select_textobject ~= nil); print("move loaded=", require("nvim-treesitter-textobjects.move").goto_next_start ~= nil)' \
  +qa
```

## Pitfalls / notes

- Do NOT stay on `master`. It is frozen and will not receive 0.12 fixes.
- The `main` branch is a full rewrite; treat it as a different plugin. Old
  `nvim-treesitter.configs.setup({...})` configs will not work.
- `tree-sitter` CLI is now a hard requirement. Without it, `:TSInstall` /
  `:TSUpdate` fail at the `tree-sitter generate` / `tree-sitter build` step.
- `cargo install tree-sitter-cli` requires Cargo >= 1.85 (edition2024).
  Use the prebuilt binary on older toolchains.
- `Query:iter_matches()` no longer accepts `all`; any custom query code in
  the user config must iterate `match[id]` as a `TSNode[]` list.
- Textobjects `select` keymaps must be set manually in the new API; the
  old `keymaps = { ["af"] = { query = ... } }` table form is gone.
- `image.nvim` (if used) surfaces this crash first because its markdown
  integration triggers a treesitter parse on `FileType`. The bug is in
  treesitter itself, not image.nvim.

## Files changed in this migration

- `nvim.0.12/.config/nvim/lua/plugins/treesitter.lua` (rewritten)
- `nvim.0.12/.config/nvim/init.lua` (PATH prepend)
- `nvim.0.12/.config/nvim/lazy-lock.json` (branch + commit flips for both
  nvim-treesitter and nvim-treesitter-textobjects)

## External artifacts installed

- `tree-sitter` CLI v0.26.11 at `~/.local/bin/tree-sitter`
  (prebuilt binary from GitHub releases).
- 11 parsers rebuilt to `~/.local/share/nvim/site/parser/`:
  lua, vim, vimdoc, query, javascript, html, python, bash, fish, markdown,
  markdown_inline.
