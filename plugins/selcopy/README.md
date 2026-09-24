# selcopy

Copy a visual selection into a new window, backed by a random temporary file.

## Install

```lua
-- lua/plugins/selcopy.lua
return {
  dir = "~/workspace/dotfiles/plugins/selcopy/lua/selcopy",
  config = function()
    require("selcopy").setup({
      keymap = "<leader>sc", -- visual mode mapping
    })
  end,
}
```

Or use `main = "selcopy"` and `opts = { ... }`.

## Usage

1. Select text in visual mode.
2. Press `<leader>sc` (or the configured keymap).
3. A new window opens to the right containing the selection, saved to a
   random temp file (via `vim.fn.tempname()`). Insert mode starts so you can
   keep typing; `:w` persists to the temp file.

The first line of the new buffer is a source reference of the form:

```
@<path> L<start-line>
```

where `<path>` is the source file relative to the git project root (detected
via `git rev-parse --show-toplevel`), or a `~`-expanded absolute path when the
file is not inside a git repository, and `<start-line>` is the line number
where the visual selection started.

Example: selecting from line 3 of `~/workspace/pandora/docs/chaos-testing.md`
in a repo rooted at `~/workspace/pandora` yields a first line of:

```
@docs/chaos-testing.md L3
```

## Options

| Option             | Type     | Default | Description                        |
| ------------------ | -------- | ------- | ---------------------------------- |
| `vertical_split`   | boolean  | `true`  | Split right instead of horizontal  |
| `split_size`       | number   | `60`    | New window size (cols or rows)     |
| `inherit_filetype` | boolean  | `true`  | Copy filetype from source buffer   |
| `save_to_temp_file`| boolean  | `true`  | Back the buffer with a temp file   |
| `keymap`           | string   | `nil`   | Visual mode keymap to trigger      |

## API

- `require("selcopy").setup(opts)` — apply options, register keymap.
- `require("selcopy").open()` — run on a visual selection.