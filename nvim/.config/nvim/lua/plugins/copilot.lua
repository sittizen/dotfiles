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
			["go"] = true,
		}
		vim.g.copilot_no_tab_map = true
		vim.keymap.set("i", "<C-j>", 'copilot#Accept("\\<CR>")', {
			expr = true,
			replace_keycodes = false,
		})
		vim.keymap.set({ "n", "x" }, "<leader>oc", function()
			if vim.b.copilot_enabled then
				vim.b.copilot_enabled = false
				vim.cmd("Copilot enable")
				vim.notify("Copilot enabled")
			else
				vim.b.copilot_enabled = true
				vim.cmd("Copilot disable")
				vim.notify("Copilot disabled")
			end
		end, { desc = "Toggle copilot" })
	end,
}
