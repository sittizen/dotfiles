--- Configuration module for quick-translate
--- @module quick-translate.config

local M = {}

--- Default configuration values
--- @type table
M.defaults = {
  target_language = nil, -- Required: e.g., 'en', 'it', 'es'
  source_language = 'auto', -- Optional: defaults to 'auto'
  keymap = nil, -- Optional: no default binding
}

--- Current configuration (merged with defaults after setup)
--- @type table|nil
M.config = nil

--- Merge user options with defaults
--- @param opts table|nil User-provided options
--- @return table Merged configuration
function M.merge(opts)
  opts = opts or {}
  return vim.tbl_deep_extend('force', vim.deepcopy(M.defaults), opts)
end

--- Get the current configuration
--- @return table|nil Current configuration or nil if not setup
function M.get()
  return M.config
end

--- Set the configuration
--- @param config table Configuration to set
function M.set(config)
  M.config = config
end

--- Check if the plugin has been setup
--- @return boolean
function M.is_setup()
  return M.config ~= nil
end

--- Get the API key from environment variable
--- @return string|nil API key or nil if not set
function M.get_api_key()
  return os.getenv('GOOGLE_TRANSLATE_API_KEY')
end

--- Validate API key is available (called on first use, not setup)
--- @return boolean, string|nil True if valid, false and error message otherwise
function M.validate_api_key()
  local api_key = M.get_api_key()
  if not api_key or api_key == '' then
    return false, 'GOOGLE_TRANSLATE_API_KEY environment variable is not set'
  end
  return true, nil
end

return M
