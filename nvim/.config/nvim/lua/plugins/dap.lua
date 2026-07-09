return {
	{
		"mfussenegger/nvim-dap",
		dependencies = {
			"mfussenegger/nvim-dap-python",
			"rcarriga/nvim-dap-ui",
			"theHamsta/nvim-dap-virtual-text",
			"nvim-neotest/nvim-nio",
		},
		keys = {
			{
				"<leader>db",
				function()
					require("dap").toggle_breakpoint()
				end,
				desc = "Toggle breakpoint",
			},

			{
				"<leader>dc",
				function()
					require("dap").continue()
				end,
				desc = "Continue / Start",
			},

			{
				"<F6>",
				function()
					require("dap").step_into()
				end,
				desc = "Step Into",
			},
			{
				"<F7>",
				function()
					require("dap").step_over()
				end,
				desc = "Step Over",
			},
			{
				"<F8>",
				function()
					require("dap").step_out()
				end,
				desc = "Step Out",
			},

			{
				"<F9>",
				function()
					require("dap").run_to_cursor()
				end,
				desc = "Run to cursor",
			},

			{
				"<leader>dq",
				function()
					require("dap").terminate()
				end,
				desc = "Terminate debugging",
			},

			{
				"<leader>dt",
				function()
					require("dapui").toggle()
				end,
				desc = "Toggle DAP UI",
			},
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

			dap.configurations.python = dap.configurations.python or {}

			-- Remote attach to a debugpy server running inside a dev container.
			-- Container must publish its debug port to the host (e.g. run.sh -P 5678),
			-- so nvim connects through 127.0.0.1:<host_port>.
			-- In the container run e.g.:
			--   uv run python -m debugpy --listen 0.0.0.0:5678 --wait-for-client -m pytest
			-- Module roots: host project dir <-> /app (the bind mount via run.sh).
			local remote_port = tonumber(vim.env.DEBUGPY_PORT) or 5678
			local remote_host = vim.env.DEBUGPY_HOST or "127.0.0.1"
			local remote_root = vim.env.DEBUGPY_REMOTE_ROOT or "/app"

			table.insert(dap.configurations.python, {
				type = "python",
				request = "attach",
				name = "Attach remote debugpy (Docker)",
				host = remote_host,
				port = remote_port,
				pathMappings = {
					{ localRoot = vim.fn.getcwd(), remoteRoot = remote_root },
				},
				justMyCode = false,
				showReturnValue = true,
			})

			-- Pick a sensible per-project python from the uv venv if present, so
			-- launch-style configs (pytest/launch current file) work locally too.
			local function resolve_python()
				local candidates = {
					vim.fn.getcwd() .. "/.venv/bin/python",
					vim.env.VIRTUAL_ENV and (vim.env.VIRTUAL_ENV .. "/bin/python") or nil,
					"python3",
					"python",
				}
				for _, c in ipairs(candidates) do
					if c and vim.fn.executable(c) == 1 then
						return c
					end
				end
				return "python3"
			end
			dap_python.setup(resolve_python())

			-- launch (run current file) helper used when NOT attaching to a container
			table.insert(dap.configurations.python, {
				type = "python",
				request = "launch",
				name = "Launch current file (local venv)",
				program = "${file}",
				python = resolve_python(),
				cwd = "${workspaceFolder}",
				justMyCode = false,
			})

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
		end,
	},
}
