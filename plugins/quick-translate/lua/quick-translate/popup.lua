--- Popup module for quick-translate
--- Handles the floating window for text input
--- @module quick-translate.popup

local config = require('quick-translate.config')
local api = require('quick-translate.api')

local M = {}

--- Current popup state
--- @type table|nil
M.state = nil

--- Flag to track if translation is in progress
--- @type boolean
M.translating = false

--- Flag to track if we're showing a translation result (vs input mode)
--- @type boolean
M.has_result = false

--- Flag to track if we're showing an error result (vs success result)
--- @type boolean
M.has_error = false

--- Store the original input text for retry functionality
--- @type string|nil
M.stored_input = nil

--- Default popup configuration
M.defaults = {
  width = 40,
  height = 1,
  border = 'rounded',
  title = ' Translate ',
  result_title = ' Translation ',
  error_title = ' Error ',
}

--- Calculate popup position near cursor
--- @return number, number row and col for the popup
local function get_popup_position()
  local cursor = vim.api.nvim_win_get_cursor(0)
  local row = cursor[1]
  local col = cursor[2]

  -- Position popup below the cursor
  return row, col
end

--- Create the floating window buffer and window
--- @param opts table|nil Optional configuration overrides
--- @return table|nil State table with buf and win, or nil on error
function M.open(opts)
  -- Close existing popup if open
  if M.state then
    M.close()
  end

  opts = opts or {}
  local width = opts.width or M.defaults.width
  local height = opts.height or M.defaults.height
  local border = opts.border or M.defaults.border
  local title = opts.title or M.defaults.title

  -- Create a scratch buffer
  local buf = vim.api.nvim_create_buf(false, true)
  if not buf or buf == 0 then
    vim.notify('quick-translate: failed to create buffer', vim.log.levels.ERROR)
    return nil
  end

  -- Set buffer options
  vim.api.nvim_set_option_value('buftype', 'prompt', { buf = buf })
  vim.api.nvim_set_option_value('bufhidden', 'wipe', { buf = buf })
  vim.api.nvim_set_option_value('swapfile', false, { buf = buf })

  -- Get position
  local row, col = get_popup_position()

  -- Calculate window position (relative to cursor)
  local win_opts = {
    relative = 'cursor',
    row = 1, -- Below cursor
    col = 0,
    width = width,
    height = height,
    style = 'minimal',
    border = border,
    title = title,
    title_pos = 'center',
  }

  -- Create the floating window
  local win = vim.api.nvim_open_win(buf, true, win_opts)
  if not win or win == 0 then
    vim.api.nvim_buf_delete(buf, { force = true })
    vim.notify('quick-translate: failed to create window', vim.log.levels.ERROR)
    return nil
  end

  -- Store state
  M.state = {
    buf = buf,
    win = win,
    row = row,
    col = col,
  }

  -- Set up keymaps for the popup buffer
  M.setup_keymaps(buf)

  -- Enter insert mode
  vim.cmd('startinsert')

  return M.state
end

--- Set up keymaps for the popup
--- @param buf number Buffer handle
function M.setup_keymaps(buf)
  local opts = { buffer = buf, noremap = true, silent = true }

  -- Escape closes the popup
  vim.keymap.set('i', '<Esc>', function()
    M.close()
  end, opts)

  vim.keymap.set('n', '<Esc>', function()
    M.close()
  end, opts)

  -- Also close on q in normal mode
  vim.keymap.set('n', 'q', function()
    M.close()
  end, opts)

  -- Enter submits the text for translation, copies result and closes, or retries on error
  vim.keymap.set('i', '<CR>', function()
    if M.has_error then
      M.retry()
    elseif M.has_result then
      M.copy_and_close()
    else
      M.submit()
    end
  end, opts)

  vim.keymap.set('n', '<CR>', function()
    if M.has_error then
      M.retry()
    elseif M.has_result then
      M.copy_and_close()
    else
      M.submit()
    end
  end, opts)
end

--- Close the popup window
function M.close()
  if not M.state then
    return
  end

  local win = M.state.win
  local buf = M.state.buf

  -- Close window if valid
  if win and vim.api.nvim_win_is_valid(win) then
    vim.api.nvim_win_close(win, true)
  end

  -- Delete buffer if valid (should be auto-wiped due to bufhidden=wipe)
  if buf and vim.api.nvim_buf_is_valid(buf) then
    vim.api.nvim_buf_delete(buf, { force = true })
  end

  M.state = nil
  M.has_result = false
  M.has_error = false
  M.stored_input = nil

  -- Exit insert mode if we're still in it
  vim.cmd('stopinsert')
end

--- Copy the current text to the default register and close the popup
--- @return boolean True if text was copied, false otherwise
function M.copy_and_close()
  if not M.is_open() then
    return false
  end

  -- Get the text content
  local text = M.get_text()
  if not text or text == '' then
    M.close()
    return false
  end

  -- Copy to the default (unnamed) register
  vim.fn.setreg('"', text)

  -- Close the popup
  M.close()

  return true
end

--- Check if popup is currently open
--- @return boolean
function M.is_open()
  if not M.state then
    return false
  end
  return M.state.win and vim.api.nvim_win_is_valid(M.state.win)
end

--- Update the popup window title
--- @param title string New title for the popup
function M.set_title(title)
  if not M.is_open() then
    return
  end

  local win = M.state.win
  local win_config = vim.api.nvim_win_get_config(win)
  win_config.title = title
  vim.api.nvim_win_set_config(win, win_config)
end

--- Calculate the required height for text content
--- @param text string The text to measure
--- @param width number The available width
--- @return number The required height in lines
local function calculate_height(text, width)
  if not text or text == '' then
    return 1
  end

  -- Split text into lines first
  local lines = vim.split(text, '\n', { plain = true })
  local total_lines = 0

  for _, line in ipairs(lines) do
    -- Calculate how many wrapped lines this line needs
    local line_len = vim.fn.strdisplaywidth(line)
    local wrapped_lines = math.max(1, math.ceil(line_len / width))
    total_lines = total_lines + wrapped_lines
  end

  return math.max(1, total_lines)
end

--- Resize the popup window to fit content
--- @param text string The text content
function M.resize_to_fit(text)
  if not M.is_open() then
    return
  end

  local win = M.state.win
  local win_config = vim.api.nvim_win_get_config(win)

  -- Calculate required height based on text
  local width = win_config.width
  local new_height = calculate_height(text, width)

  -- Limit maximum height to prevent taking over the entire screen
  local max_height = math.floor(vim.o.lines * 0.5)
  new_height = math.min(new_height, max_height)

  if new_height ~= win_config.height then
    win_config.height = new_height
    vim.api.nvim_win_set_config(win, win_config)
  end
end

--- Get the current text from the popup
--- @return string|nil Text content or nil if popup not open
function M.get_text()
  if not M.state or not M.state.buf then
    return nil
  end

  if not vim.api.nvim_buf_is_valid(M.state.buf) then
    return nil
  end

  local lines = vim.api.nvim_buf_get_lines(M.state.buf, 0, -1, false)
  if #lines == 0 then
    return ''
  end

  -- For prompt buffer, the text is after any prompt prefix
  return lines[1] or ''
end

--- Set the text content of the popup
--- @param text string Text to set in the popup
function M.set_text(text)
  if not M.state or not M.state.buf then
    return
  end

  if not vim.api.nvim_buf_is_valid(M.state.buf) then
    return
  end

  -- Need to temporarily make buffer modifiable if it isn't
  local was_modifiable = vim.api.nvim_get_option_value('modifiable', { buf = M.state.buf })
  if not was_modifiable then
    vim.api.nvim_set_option_value('modifiable', true, { buf = M.state.buf })
  end

  vim.api.nvim_buf_set_lines(M.state.buf, 0, -1, false, { text })

  if not was_modifiable then
    vim.api.nvim_set_option_value('modifiable', false, { buf = M.state.buf })
  end
end

--- Check if translation is currently in progress
--- @return boolean
function M.is_translating()
  return M.translating
end

--- Submit the text for translation
--- This is triggered when Enter is pressed in the popup
function M.submit()
  -- Prevent multiple submissions
  if M.translating then
    return
  end

  -- Check if popup is open
  if not M.is_open() then
    return
  end

  -- Get the text to translate
  local text = M.get_text()
  if not text or text == '' then
    return
  end

  -- Store the input text for potential retry
  M.stored_input = text

  -- Get language settings from config
  local cfg = config.get()
  if not cfg then
    vim.notify('quick-translate: plugin not configured', vim.log.levels.ERROR)
    return
  end

  local source_lang = cfg.source_language or 'auto'
  local target_lang = cfg.target_language
  if not target_lang then
    vim.notify('quick-translate: target_language not configured', vim.log.levels.ERROR)
    return
  end

  -- Mark as translating
  M.translating = true

  -- Disable input by making buffer non-modifiable
  if M.state and M.state.buf and vim.api.nvim_buf_is_valid(M.state.buf) then
    vim.api.nvim_set_option_value('modifiable', false, { buf = M.state.buf })
  end

  -- Show translating message
  M.set_text('Translating...')

  -- Exit insert mode while translating
  vim.cmd('stopinsert')

  -- Make synchronous API call
  local result = api.translate(text, source_lang, target_lang)

  -- Re-enable input temporarily to set result text
  if M.state and M.state.buf and vim.api.nvim_buf_is_valid(M.state.buf) then
    vim.api.nvim_set_option_value('modifiable', true, { buf = M.state.buf })
  end

  -- Mark as no longer translating
  M.translating = false

  -- Handle the result
  if result.success then
    M.set_text(result.text)
    M.set_title(M.defaults.result_title)
    M.resize_to_fit(result.text)
    M.has_result = true
    M.has_error = false
    -- Keep result read-only - user should not edit the translation
    if M.state and M.state.buf and vim.api.nvim_buf_is_valid(M.state.buf) then
      vim.api.nvim_set_option_value('modifiable', false, { buf = M.state.buf })
    end
  else
    local error_msg = 'Error: ' .. (result.error and result.error.message or 'Unknown error')
    M.set_text(error_msg)
    M.set_title(M.defaults.error_title)
    M.resize_to_fit(error_msg)
    M.has_result = true
    M.has_error = true
    vim.notify('quick-translate: ' .. error_msg, vim.log.levels.ERROR)
    -- Keep error result read-only - user presses Enter to retry
    if M.state and M.state.buf and vim.api.nvim_buf_is_valid(M.state.buf) then
      vim.api.nvim_set_option_value('modifiable', false, { buf = M.state.buf })
    end
  end
end

--- Retry translation after an error
--- Returns to input mode with the previously entered text
function M.retry()
  -- Check if popup is open and we have stored input
  if not M.is_open() then
    return
  end

  if not M.stored_input or M.stored_input == '' then
    return
  end

  -- Re-enable input by making buffer modifiable
  if M.state and M.state.buf and vim.api.nvim_buf_is_valid(M.state.buf) then
    vim.api.nvim_set_option_value('modifiable', true, { buf = M.state.buf })
  end

  -- Restore the original input text
  M.set_text(M.stored_input)

  -- Reset to input mode state
  M.set_title(M.defaults.title)
  M.has_result = false
  M.has_error = false

  -- Resize back to single line (input mode default)
  if M.state and M.state.win and vim.api.nvim_win_is_valid(M.state.win) then
    local win_config = vim.api.nvim_win_get_config(M.state.win)
    win_config.height = M.defaults.height
    vim.api.nvim_win_set_config(M.state.win, win_config)
  end

  -- Enter insert mode for editing
  vim.cmd('startinsert')
  -- Move cursor to end of line
  vim.cmd('normal! $')
end

return M
