local scutils = {}

function scutils.get_containing_function()
	local word = vim.fn.expand("<cword>")
	if not word or word == "" then
		vim.notify("ToPysdk: No word provided", vim.log.levels.ERROR)
		return
	end

	-- Get the function name containing the cursor using LSP
	local function_name = nil
	local cursor_pos = vim.api.nvim_win_get_cursor(0)
	local cursor_line = cursor_pos[1] - 1 -- 0-indexed
	local params = { textDocument = vim.lsp.util.make_text_document_params() }
	local results = vim.lsp.buf_request_sync(0, "textDocument/documentSymbol", params, 1000)

	if results then
		for _, res in pairs(results) do
			if res.result then
				local function_kinds = {
					[vim.lsp.protocol.SymbolKind.Function] = true,
					[vim.lsp.protocol.SymbolKind.Method] = true,
				}

				local function find_enclosing_function(symbols)
					for _, symbol in ipairs(symbols) do
						local range = symbol.range or (symbol.location and symbol.location.range)
						if range then
							local start_line = range.start.line
							local end_line = range["end"].line
							if cursor_line >= start_line and cursor_line <= end_line then
								if function_kinds[symbol.kind] then
									function_name = symbol.name
								end
								-- Check children for nested functions
								if symbol.children then
									find_enclosing_function(symbol.children)
								end
							end
						end
					end
				end

				find_enclosing_function(res.result)
			end
		end
	end

	if not function_name then
		vim.notify("ToPysdk: Could not determine enclosing function via LSP", vim.log.levels.WARN)
	end
	return function_name
end

return scutils
