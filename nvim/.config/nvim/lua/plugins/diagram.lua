return {
	"3rd/diagram.nvim",
	dependencies = {
		{ "3rd/image.nvim", opts = {} },
	},
	opts = {
		renderer_options = {
			mermaid = {
				cli_args = { "--no-sandbox" },
				theme = "dark",
			},
		},
		events = {
			render_buffer = {},
			clear_buffer = { "BufLeave" },
		},
	},
	keys = {
		{
			"<leader>im",
			function()
				require("diagram").show_diagram_hover()
			end,
			desc = "Render markdown diagram",
		},
	},
	config = function()
		require("diagram").setup({
			integrations = {
				require("diagram.integrations.markdown"),
			},
		})
	end,
}
