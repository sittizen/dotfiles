return {
	"github/copilot.vim",
	enabled = true,
	config = function()
		vim.b.copilot_enabled = true
		vim.g.copilot_filetypes = {
			["*"] = false,
			["python"] = true,
			["sh"] = true,
			["bash"] = true,
			["lua"] = true,
		}
		vim.g.copilot_no_tab_map = true
		vim.keymap.set("i", "<C-j>", 'copilot#Accept("\\<CR>")', {
			expr = true,
			replace_keycodes = false,
		})
		vim.keymap.set({ "n", "x" }, "<leader>oc", function()
			if vim.b.copilot_enabled then
				vim.cmd("Copilot enable")
			else
				vim.cmd("Copilot disable")
			end
		end, { desc = "Toggle copilot" })
	end,
}
