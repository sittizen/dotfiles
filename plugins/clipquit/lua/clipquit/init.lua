--- clipquit - Copy buffer content to system clipboard and close the buffer
--- @module clipquit

local M = {}

--- Default configuration
local defaults = {
  --- Notify after copying and closing
  --- @type boolean
  notify = true,
}

local config = vim.deepcopy(defaults)

--- Apply user options
--- @param opts table|nil
function M.setup(opts)
  config = vim.tbl_deep_extend("force", config, opts or {})
end

--- Copy the whole buffer content to the system clipboard (+ register)
--- and close the buffer.
function M.quit()
  vim.cmd("%y+")
  vim.cmd("bdelete!")
  if config.notify then
    vim.notify("Buffer copied to clipboard and closed", vim.log.levels.INFO)
  end
end

return M