-- Luacheck configuration for Neovim plugin
-- See: https://luacheck.readthedocs.io/en/stable/config.html

-- Neovim globals
globals = {
  "vim",
}

-- Plenary test globals
files["tests/**/*_spec.lua"] = {
  globals = {
    "describe",
    "it",
    "before_each",
    "after_each",
    "assert",
  }
}

-- Allow unused self argument (common in OOP style)
self = false

-- Maximum line length
max_line_length = 120

-- Ignore some common patterns
ignore = {
  "212", -- Unused argument (for callbacks)
}
