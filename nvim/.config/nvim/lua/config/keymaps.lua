-- Disable default s as we use to start surrounding
vim.keymap.set("n", "s", "<Nop>", { desc = "Disable default s key" })
vim.keymap.set(
	"n",
	"<Esc>",
	"<cmd>nohlsearch<CR>",
	{ desc = "Clear highlights on search when pressing <Esc> in normal mode." }
)
vim.keymap.set("n", "<leader>q", vim.diagnostic.setloclist, { desc = "Open diagnostic [Q]uickfix list" })

-- Arrow keys with what I'm used to
vim.keymap.set("n", "h", "i")
vim.keymap.set("n", "i", "<up>")
vim.keymap.set("n", "j", "<left>")
vim.keymap.set("n", "k", "<down>")
vim.keymap.set("n", "l", "<right>")

vim.keymap.set("x", "i", "<up>")
vim.keymap.set("x", "j", "<left>")
vim.keymap.set("x", "k", "<down>")
vim.keymap.set("x", "l", "<right>")

vim.keymap.set("v", "i", "<up>")
vim.keymap.set("v", "j", "<left>")
vim.keymap.set("v", "k", "<down>")
vim.keymap.set("v", "l", "<right>")

-- Move lines the way I'm used to
vim.keymap.set("n", "<C-i>", ":m .-2<CR>==", { desc = "Move line up" })
vim.keymap.set("n", "<C-k>", ":m .+1<CR>==", { desc = "Move line down" })
vim.keymap.set("v", "<C-k>", ":m '>+1<CR>gv=gv", { desc = "Move selected lines down" })
vim.keymap.set("v", "<C-i>", ":m '<-2<CR>gv=gv", { desc = "Move selected lines up" })

-- Other remaps
vim.keymap.set("n", "\\", ":cd %:h<CR>:e .<CR>", { desc = "Open oil in current buffer dir" })
vim.keymap.set("n", "<C-u>", "g~iww", { desc = "Uppercase word under cursor" })

-- LSP
vim.api.nvim_set_keymap(
	"n",
	"gD",
	"<cmd>lua vim.lsp.buf.declaration()<CR>",
	{ noremap = true, silent = true, desc = "Go to declaration" }
)
vim.api.nvim_set_keymap(
	"n",
	"gd",
	"<cmd>lua vim.lsp.buf.definition()<CR>",
	{ noremap = true, silent = true, desc = "Go to definition" }
)

local temp_buf = function(body)
	vim.cmd("vsplit")
	local buf = vim.api.nvim_create_buf(false, true)
	vim.api.nvim_win_set_buf(0, buf)
	vim.api.nvim_buf_set_lines(buf, 0, -1, false, vim.split(body, "\n"))
	vim.bo[buf].buftype = "nofile"
	vim.bo[buf].bufhidden = "wipe"
	vim.bo[buf].filetype = "text"
end

vim.keymap.set("n", "<leader>it", function()
	local scu = require("scutils")
	local enclosing_test = scu.get_containing_function()
	local parts = vim.split(vim.fn.expand("%:p"), "/", { plain = true })
	local filepath = table.concat(parts, "/", 9)
	local res = require("pysdk").to_pysdk("x_run_test_fun -p " .. filepath .. "::" .. enclosing_test)
	local prompt = "Explain why this unit test is failing: \n" .. res
	vim.schedule(function()
		require("opencode").prompt(prompt)
	end)
end, { desc = "Launch test under cursor and ask opencode why it's failing" })

vim.keymap.set("n", "<leader>il", function()
	local filepath = vim.fn.expand("%:p")
	local parts = vim.split(filepath, "/", { plain = true })
	filepath = table.concat(parts, "/", 8)
	local format_out = require("pysdk").to_pysdk("x_format -p " .. filepath)
	local lint_out = require("pysdk").to_pysdk("x_lint -p " .. filepath)
	temp_buf(format_out .. lint_out)
end, { desc = "Check linting" })
