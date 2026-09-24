return {
	dir = "~/workspace/dotfiles/plugins/selcopy",
	keys = {
		{
			"<leader>io",
			function()
				require("selcopy").open()
			end,
			mode = "v",
			desc = "Copy selection to new window (temp file)",
		},
	},
	config = function()
		require("selcopy").setup({})
	end,
}
