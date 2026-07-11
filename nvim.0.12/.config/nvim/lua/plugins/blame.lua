return {
	{
		"FabijanZulj/blame.nvim",
		lazy = false,
		config = function()
			require("blame").setup({
				merge_consecutive = true,
			})
		end,
	},
}
