--- Quick Translate - A minimal Neovim plugin for quick translations
--- @module quick-translate

local config = require('quick-translate.config')
local popup = require('quick-translate.popup')

local M = {}

--- Setup the plugin with user options
--- @param opts table|nil Configuration options
---   - target_language (string): Target language code (e.g., 'en', 'it', 'es')
---   - source_language (string, optional): Source language code (default: 'auto')
---   - keymap (string, optional): Keymap to open translation popup (no default)
function M.setup(opts)
  local merged_config = config.merge(opts)
  config.set(merged_config)

  -- Set up keymap if provided
  if merged_config.keymap then
    vim.keymap.set('n', merged_config.keymap, function()
      M.open()
    end, { desc = 'Open quick-translate popup' })
  end
end

--- Get the current configuration
--- @return table|nil Current configuration
function M.get_config()
  return config.get()
end

--- Open the translation popup
function M.open()
  -- Validate API key on first use
  local ok, err = config.validate_api_key()
  if not ok then
    vim.notify(err, vim.log.levels.ERROR)
    return
  end

  -- Open the popup window
  popup.open()
end

--- Close the translation popup
function M.close()
  popup.close()
end

--- Check if the popup is currently open
--- @return boolean
function M.is_open()
  return popup.is_open()
end

return M
