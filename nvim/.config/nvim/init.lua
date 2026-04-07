require("config.options")
require("core.lazy")
require("core.lsp")
require("config.keymaps")
require("config.autocmds")
vim.env.UV_NATIVE_TLS = "1"
vim.g.loaded_node_provider = 0
vim.g.loaded_perl_provider = 0
vim.g.loaded_python3_provider = 0
vim.g.loaded_ruby_provider = 0

vim.opt.runtimepath:append("~/workspace/dotfiles/plugins/quick-translate/")
require("quick-translate").setup({
	target_language = "en",
	source_language = "it",
	keymap = "<leader>it",
})
