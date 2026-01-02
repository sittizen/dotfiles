return {
	{
		dir = "~/workspace/neovim_plugins/pysdk.nvim",
		config = function()
			require("pysdk").setup()
		end,
	},
}
