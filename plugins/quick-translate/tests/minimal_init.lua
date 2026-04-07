-- Minimal init for plenary tests
-- This file sets up the test environment

-- Add the plugin to the runtime path
local plugin_root = vim.fn.fnamemodify(debug.getinfo(1, 'S').source:sub(2), ':h:h')
vim.opt.rtp:prepend(plugin_root)

-- Add plenary to runtime path if not already available
-- This assumes plenary is installed in a standard location
local plenary_path = vim.fn.stdpath('data') .. '/lazy/plenary.nvim'
if vim.fn.isdirectory(plenary_path) == 1 then
  vim.opt.rtp:prepend(plenary_path)
end

-- Alternative: Check for plenary in site packages
local site_plenary = vim.fn.stdpath('data') .. '/site/pack/vendor/start/plenary.nvim'
if vim.fn.isdirectory(site_plenary) == 1 then
  vim.opt.rtp:prepend(site_plenary)
end

-- Set up minimal vim options for testing
vim.opt.swapfile = false
vim.opt.backup = false
vim.opt.writebackup = false

-- Load plenary
local ok, _ = pcall(require, 'plenary')
if not ok then
  print('Warning: plenary.nvim not found. Tests may fail.')
end
