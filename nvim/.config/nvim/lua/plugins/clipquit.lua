return {
	dir = "~/workspace/dotfiles/plugins/clipquit",
	keys = {
		{
			"<leader>iq",
			function()
				require("clipquit").quit()
			end,
			desc = "Copy buffer to clipboard and close it",
		},
	},
	config = function()
		require("clipquit").setup({})
	end,
}