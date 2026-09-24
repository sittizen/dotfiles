--- selcopy - Copy visual selection into a new window with a random temp file
--- @module selcopy

local M = {}

--- Default configuration
local defaults = {
  --- Open the new window to the right (vertical split)
  --- @type boolean
  vertical_split = true,

  --- Split size in columns (or rows for horizontal split)
  --- @type number|nil
  split_size = 60,

  --- Inherit filetype from the source buffer
  --- @type boolean
  inherit_filetype = true,

  --- Create buffer as a real file backed by a temp file
  --- @type boolean
  save_to_temp_file = true,
}

local config = vim.deepcopy(defaults)

--- Apply user options
--- @param opts table|nil
function M.setup(opts)
  config = vim.tbl_deep_extend("force", config, opts or {})
end

--- Get the current visual selection as a list of lines, using the '< and '>
--- marks via getpos() (build-independent). Handles charwise (v), linewise (V)
--- and blockwise (^V) selections.
--- @return string[]|nil, number|nil  lines, start line (1-based)
local function get_visual_selection()
  local mode = vim.fn.visualmode()
  local spos = vim.fn.getpos("'<")
  local epos = vim.fn.getpos("'>")

  if spos[2] == 0 or epos[2] == 0 then
    return nil
  end

  local srow, scol = spos[2] - 1, spos[3]
  local erow, ecol = epos[2] - 1, epos[3]

  local lines = vim.api.nvim_buf_get_lines(0, srow, erow + 1, false)
  if #lines == 0 then
    return lines, spos[2]
  end

  if mode == "V" then
    return lines, spos[2]
  end

  if mode == "\22" then
    -- blockwise: take a column range on every line
    local lo, hi = math.min(scol, ecol), math.max(scol, ecol)
    local out = {}
    for i, l in ipairs(lines) do
      out[i] = string.sub(l, lo, hi)
    end
    return out, spos[2]
  end

  -- charwise
  if vim.o.selection == "exclusive" and ecol > scol then
    ecol = ecol - 1
  end
  if #lines > 1 then
    lines[1] = string.sub(lines[1], scol)
    lines[#lines] = string.sub(lines[#lines], 1, ecol)
  else
    lines[1] = string.sub(lines[1], scol, ecol)
  end
  return lines, spos[2]
end

--- Path of the source buffer relative to the git project root, or a
--- full/expanded path if not in a git repository.
--- @param buf number
--- @return string
local function source_path(buf)
  local fname = vim.api.nvim_buf_get_name(buf)
  if fname == "" then
    return ""
  end
  local dir = vim.fn.fnamemodify(fname, ":h")
  local root = vim.fn.system({ "git", "-C", dir, "rev-parse", "--show-toplevel" })
  if vim.v.shell_error == 0 and root ~= "" then
    root = vim.fn.trim(root)
    local full = vim.fn.fnamemodify(fname, ":p")
    if full:sub(1, #root) == root then
      return full:sub(#root + 2)
    end
  end
  return vim.fn.fnamemodify(fname, ":~")
end

--- Copy the current visual selection into a new buffer in a new window.
--- The buffer is backed by a random temporary file.
function M.open()
  local source_buf = vim.api.nvim_get_current_buf()

  -- Exit visual mode so the '< and '> marks are updated and
  -- visualmode() reports the selection mode.
  if vim.api.nvim_get_mode().mode:match("^[vV\22]") then
    vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("<Esc>", true, false, true), "nx", false)
  end

  local lines, start_line = get_visual_selection()
  if not lines or #lines == 0 then
    vim.notify("selcopy: no visual selection", vim.log.levels.WARN)
    return
  end

  local ref = source_path(source_buf)
  if ref ~= "" then
    table.insert(lines, 1, "@" .. ref .. " L" .. (start_line or 1))
  end

  if config.save_to_temp_file then
    local tmpfile = vim.fn.tempname()
    vim.cmd(config.vertical_split and "vsplit" or "split")
    vim.cmd("edit " .. vim.fn.escape(tmpfile, " "))
  else
    vim.cmd(config.vertical_split and "vsplit" or "split")
    vim.cmd("enew")
  end

  if config.split_size then
    if config.vertical_split then
      vim.api.nvim_win_set_width(0, config.split_size)
    else
      vim.api.nvim_win_set_height(0, config.split_size)
    end
  end

  local target_buf = vim.api.nvim_get_current_buf()
  vim.api.nvim_buf_set_lines(target_buf, 0, -1, false, lines)

  if config.save_to_temp_file then
    vim.api.nvim_buf_call(target_buf, function()
      vim.cmd("write")
    end)
  end

  if config.inherit_filetype then
    local ft = vim.api.nvim_buf_get_option(source_buf, "filetype")
    if ft ~= "" then
      vim.api.nvim_buf_set_option(target_buf, "filetype", ft)
    end
  end

  vim.api.nvim_buf_call(target_buf, function()
    vim.cmd("startinsert")
  end)
end

return M