return {
	"folke/snacks.nvim",
	priority = 1000,
	lazy = false,
	---@type snacks.Config
	opts = {
		terminal = { enabled = true },
		input = { enabled = true },
		picker = { enabled = false },
		toggle = { enabled = true },
		bigfile = { enabled = false },
		dahboard = { enabled = false },
		explorer = { enabled = false },
		image = { enabled = false },
		notifier = { enabled = false },
		quickfile = { enabled = false },
		scope = { enabled = false },
		scroll = { enabled = false },
		statuscolumn = { enabled = false },
		words = { enabled = false },
	},
}
