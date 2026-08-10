return {
	{
		"nvim-treesitter/nvim-treesitter",
		branch = "main",
		lazy = false,
		build = ":TSUpdate",
		config = function()
			require("nvim-treesitter").setup({})
			require("nvim-treesitter").install({
				"lua",
				"vim",
				"vimdoc",
				"query",
				"javascript",
				"html",
				"python",
				"bash",
				"fish",
				"markdown",
				"markdown_inline",
				"toml",
			})

			vim.api.nvim_create_autocmd("FileType", {
				group = vim.api.nvim_create_augroup("nvim-treesitter-start", { clear = true }),
				callback = function(args)
					if pcall(vim.treesitter.start, args.buf) then
						vim.bo[args.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
					end
				end,
			})
		end,
	},
	{
		"nvim-treesitter/nvim-treesitter-textobjects",
		branch = "main",
		lazy = false,
		dependencies = { "nvim-treesitter/nvim-treesitter" },
		init = function()
			vim.g.no_plugin_maps = true
		end,
		config = function()
			require("nvim-treesitter-textobjects").setup({
				select = {
					lookahead = true,
					selection_modes = {
						["@parameter.outer"] = "v",
						["@function.outer"] = "V",
						["@class.outer"] = "<c-v>",
					},
				},
				move = {
					set_jumps = true,
				},
			})

			local select = require("nvim-treesitter-textobjects.select")
			local move = require("nvim-treesitter-textobjects.move")
			local k = vim.keymap.set

			k({ "x", "o" }, "af", function()
				select.select_textobject("@function.outer", "textobjects")
			end, { desc = "Select all the function" })
			k({ "x", "o" }, "if", function()
				select.select_textobject("@function.inner", "textobjects")
			end, { desc = "Select inside the function" })
			k({ "x", "o" }, "ac", function()
				select.select_textobject("@class.outer", "textobjects")
			end, { desc = "Select all the class" })
			k({ "x", "o" }, "ic", function()
				select.select_textobject("@class.inner", "textobjects")
			end, { desc = "Select inside the class" })
			k({ "x", "o" }, "is", function()
				select.select_textobject("@local.scope", "locals")
			end, { desc = "Select inside the scope" })
			k({ "x", "o" }, "ai", function()
				select.select_textobject("@conditional.outer", "textobjects")
			end, { desc = "around an if statement" })
			k({ "x", "o" }, "ii", function()
				select.select_textobject("@conditional.inner", "textobjects")
			end, { desc = "inner part of an if statement" })
			k({ "x", "o" }, "al", function()
				select.select_textobject("@loop.outer", "textobjects")
			end, { desc = "around a loop" })
			k({ "x", "o" }, "il", function()
				select.select_textobject("@loop.inner", "textobjects")
			end, { desc = "inner part of a loop" })
			k({ "x", "o" }, "aa", function()
				select.select_textobject("@parameter.outer", "textobjects")
			end, { desc = "around parameter" })
			k({ "x", "o" }, "ia", function()
				select.select_textobject("@parameter.inner", "textobjects")
			end, { desc = "inside a parameter" })

			k({ "n", "x", "o" }, "[f", function()
				move.goto_previous_start("@function.outer", "textobjects")
			end, { desc = "Previous function" })
			k({ "n", "x", "o" }, "[c", function()
				move.goto_previous_start("@class.outer", "textobjects")
			end, { desc = "Previous class" })
			k({ "n", "x", "o" }, "[p", function()
				move.goto_previous_start("@parameter.inner", "textobjects")
			end, { desc = "Previous parameter" })
			k({ "n", "x", "o" }, "]f", function()
				move.goto_next_start("@function.outer", "textobjects")
			end, { desc = "Next function" })
			k({ "n", "x", "o" }, "]c", function()
				move.goto_next_start("@class.outer", "textobjects")
			end, { desc = "Next class" })
			k({ "n", "x", "o" }, "]p", function()
				move.goto_next_start("@parameter.inner", "textobjects")
			end, { desc = "Next parameter" })
		end,
	},
}
