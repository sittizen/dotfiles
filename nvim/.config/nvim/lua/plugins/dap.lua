return {
	{
		"mfussenegger/nvim-dap",
		dependencies = {
			"mfussenegger/nvim-dap-python",
			"rcarriga/nvim-dap-ui",
			"theHamsta/nvim-dap-virtual-text",
			"nvim-neotest/nvim-nio",
		},
		config = function()
			local dap = require("dap")
			local dapui = require("dapui")
			local dap_python = require("dap-python")

			require("dapui").setup()
			require("dap-python").setup()

			require("nvim-dap-virtual-text").setup({
				commented = true, -- Show virtual text alongside comment
			})

			dap_python.setup("uv")

			vim.fn.sign_define("DapBreakpoint", {
				text = "",
				texthl = "DiagnosticSignError",
				linehl = "",
				numhl = "",
			})

			vim.fn.sign_define("DapBreakpointRejected", {
				text = "", -- or "❌"
				texthl = "DiagnosticSignError",
				linehl = "",
				numhl = "",
			})

			vim.fn.sign_define("DapStopped", {
				text = "", -- or "→"
				texthl = "DiagnosticSignWarn",
				linehl = "Visual",
				numhl = "DiagnosticSignWarn",
			})

			dap.listeners.after.event_initialized["dapui_config"] = function()
				dapui.open()
			end

			dap.listeners.before.event_exited["dapui_config"] = function()
				dapui.close()
			end

			vim.keymap.set("n", "<leader>db", function()
				dap.toggle_breakpoint()
			end, { desc = "Toggle breakpoint" })

			vim.keymap.set("n", "<leader>dc", function()
				dap.continue()
			end, { desc = "Continue / Start" })

			vim.keymap.set("n", "<leader>do", function()
				dap.step_over()
			end, { desc = "Step Over" })

			vim.keymap.set("n", "<leader>di", function()
				dap.step_into()
			end, { desc = "Step Into" })

			vim.keymap.set("n", "<leader>du", function()
				dap.step_out()
			end, { desc = "Step Out" })

			vim.keymap.set("n", "<leader>dk", function()
				dap.step_out()
			end, { desc = "Step Back" })

			vim.keymap.set("n", "<leader>dr", function()
				dap.run_to_cursor()
			end, { desc = "Run to cursor" })

			vim.keymap.set("n", "<leader>dq", function()
				require("dap").terminate()
			end, { desc = "Terminate debugging" })

			vim.keymap.set("n", "<leader>dt", function()
				dapui.toggle()
			end, { desc = "Toggle DAP UI" })
		end,
	},
}
