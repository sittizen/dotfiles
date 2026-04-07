-- Tests for popup module (US-002: Open Translation Popup, US-003: Submit Text for Translation, US-004: Display Translation Result, US-005: Copy Result and Close, US-006: Handle API Errors)
local popup = require('quick-translate.popup')
local config = require('quick-translate.config')
local api = require('quick-translate.api')

describe('popup module', function()
  -- Clean up after each test
  after_each(function()
    if popup.is_open() then
      popup.close()
    end
    popup.state = nil
    popup.translating = false
    popup.has_result = false
    popup.has_error = false
    popup.stored_input = nil
  end)

  describe('module structure', function()
    it('should expose open function', function()
      assert.is_function(popup.open)
    end)

    it('should expose close function', function()
      assert.is_function(popup.close)
    end)

    it('should expose is_open function', function()
      assert.is_function(popup.is_open)
    end)

    it('should expose get_text function', function()
      assert.is_function(popup.get_text)
    end)

    it('should expose set_text function', function()
      assert.is_function(popup.set_text)
    end)

    it('should expose setup_keymaps function', function()
      assert.is_function(popup.setup_keymaps)
    end)

    it('should expose submit function', function()
      assert.is_function(popup.submit)
    end)

    it('should expose set_title function', function()
      assert.is_function(popup.set_title)
    end)

    it('should expose resize_to_fit function', function()
      assert.is_function(popup.resize_to_fit)
    end)

    it('should expose is_translating function', function()
      assert.is_function(popup.is_translating)
    end)

    it('should expose copy_and_close function', function()
      assert.is_function(popup.copy_and_close)
    end)

    it('should expose retry function', function()
      assert.is_function(popup.retry)
    end)
  end)

  describe('defaults', function()
    it('should have default width', function()
      assert.equals(40, popup.defaults.width)
    end)

    it('should have default height of 1', function()
      assert.equals(1, popup.defaults.height)
    end)

    it('should have rounded border', function()
      assert.equals('rounded', popup.defaults.border)
    end)

    it('should have Translate title', function()
      assert.equals(' Translate ', popup.defaults.title)
    end)

    it('should have Translation result title', function()
      assert.equals(' Translation ', popup.defaults.result_title)
    end)

    it('should have Error title', function()
      assert.equals(' Error ', popup.defaults.error_title)
    end)
  end)

  describe('is_open', function()
    it('should return false when no popup is open', function()
      assert.is_false(popup.is_open())
    end)

    it('should return false when state is nil', function()
      popup.state = nil
      assert.is_false(popup.is_open())
    end)
  end)

  describe('close', function()
    it('should not error when no popup is open', function()
      assert.has_no_errors(function()
        popup.close()
      end)
    end)

    it('should set state to nil', function()
      popup.state = { win = nil, buf = nil }
      popup.close()
      assert.is_nil(popup.state)
    end)
  end)

  describe('get_text', function()
    it('should return nil when popup not open', function()
      assert.is_nil(popup.get_text())
    end)

    it('should return nil when state is nil', function()
      popup.state = nil
      assert.is_nil(popup.get_text())
    end)
  end)

  describe('open', function()
    it('should create state when opened', function()
      local state = popup.open()
      -- In headless mode, this might fail gracefully
      if state then
        assert.is_table(state)
        assert.is_number(state.buf)
        assert.is_number(state.win)
      end
    end)

    it('should close existing popup before opening new one', function()
      local first_state = popup.open()
      if first_state then
        local first_buf = first_state.buf
        local second_state = popup.open()
        if second_state then
          assert.not_equals(first_buf, second_state.buf)
        end
      end
    end)
  end)

  describe('is_translating', function()
    it('should return false by default', function()
      assert.is_false(popup.is_translating())
    end)

    it('should return true when translating flag is set', function()
      popup.translating = true
      assert.is_true(popup.is_translating())
    end)
  end)

  describe('set_text', function()
    it('should not error when popup not open', function()
      assert.has_no_errors(function()
        popup.set_text('test')
      end)
    end)

    it('should not error when state is nil', function()
      popup.state = nil
      assert.has_no_errors(function()
        popup.set_text('test')
      end)
    end)
  end)

  describe('submit', function()
    local original_translate
    local original_get_api_key

    before_each(function()
      original_translate = api.translate
      original_get_api_key = config.get_api_key
    end)

    after_each(function()
      api.translate = original_translate
      config.get_api_key = original_get_api_key
    end)

    it('should not error when popup is not open', function()
      assert.has_no_errors(function()
        popup.submit()
      end)
    end)

    it('should not submit when already translating', function()
      popup.translating = true
      local submit_called = false
      api.translate = function()
        submit_called = true
        return { success = true, text = 'test' }
      end

      popup.submit()
      assert.is_false(submit_called)
    end)

    it('should not submit when text is empty', function()
      local state = popup.open()
      if state then
        local translate_called = false
        config.set({ target_language = 'it', source_language = 'en' })
        api.translate = function()
          translate_called = true
          return { success = true, text = 'test' }
        end

        popup.submit()
        assert.is_false(translate_called)
      end
    end)

    it('should not submit when config is not set', function()
      config.config = nil
      local state = popup.open()
      if state then
        local translate_called = false
        api.translate = function()
          translate_called = true
          return { success = true, text = 'test' }
        end

        popup.submit()
        assert.is_false(translate_called)
      end
    end)

    it('should not submit when target_language is not set', function()
      config.set({ source_language = 'en' })
      local state = popup.open()
      if state then
        local translate_called = false
        api.translate = function()
          translate_called = true
          return { success = true, text = 'test' }
        end

        popup.submit()
        assert.is_false(translate_called)
      end
    end)
  end)

  describe('set_title', function()
    it('should not error when popup is not open', function()
      assert.has_no_errors(function()
        popup.set_title('New Title')
      end)
    end)

    it('should not error when state is nil', function()
      popup.state = nil
      assert.has_no_errors(function()
        popup.set_title('New Title')
      end)
    end)
  end)

  describe('resize_to_fit', function()
    it('should not error when popup is not open', function()
      assert.has_no_errors(function()
        popup.resize_to_fit('Some text')
      end)
    end)

    it('should not error when state is nil', function()
      popup.state = nil
      assert.has_no_errors(function()
        popup.resize_to_fit('Some text')
      end)
    end)

    it('should not error with empty text', function()
      local state = popup.open()
      if state then
        assert.has_no_errors(function()
          popup.resize_to_fit('')
        end)
      end
    end)

    it('should not error with nil text', function()
      local state = popup.open()
      if state then
        assert.has_no_errors(function()
          popup.resize_to_fit(nil)
        end)
      end
    end)
  end)

  describe('has_result flag', function()
    it('should be false by default', function()
      assert.is_false(popup.has_result)
    end)

    it('should be reset when popup is closed', function()
      popup.has_result = true
      popup.state = { win = nil, buf = nil }
      popup.close()
      assert.is_false(popup.has_result)
    end)
  end)

  describe('has_error flag', function()
    it('should be false by default', function()
      assert.is_false(popup.has_error)
    end)

    it('should be reset when popup is closed', function()
      popup.has_error = true
      popup.state = { win = nil, buf = nil }
      popup.close()
      assert.is_false(popup.has_error)
    end)
  end)

  describe('stored_input', function()
    it('should be nil by default', function()
      assert.is_nil(popup.stored_input)
    end)

    it('should be reset when popup is closed', function()
      popup.stored_input = 'test input'
      popup.state = { win = nil, buf = nil }
      popup.close()
      assert.is_nil(popup.stored_input)
    end)
  end)

  describe('copy_and_close', function()
    it('should return false when popup is not open', function()
      assert.is_false(popup.copy_and_close())
    end)

    it('should return false when state is nil', function()
      popup.state = nil
      assert.is_false(popup.copy_and_close())
    end)

    it('should close popup after copying', function()
      local state = popup.open()
      if state then
        -- Set some text in the buffer
        vim.api.nvim_buf_set_lines(state.buf, 0, -1, false, { 'test translation' })

        local result = popup.copy_and_close()
        assert.is_true(result)
        assert.is_false(popup.is_open())
      end
    end)

    it('should copy text to default register', function()
      local state = popup.open()
      if state then
        -- Clear the register first
        vim.fn.setreg('"', '')

        -- Set some text in the buffer
        vim.api.nvim_buf_set_lines(state.buf, 0, -1, false, { 'translated text' })

        popup.copy_and_close()

        -- Check that the text was copied to the default register
        local register_content = vim.fn.getreg('"')
        assert.equals('translated text', register_content)
      end
    end)

    it('should return false and close popup when text is empty', function()
      local state = popup.open()
      if state then
        -- Set empty text
        vim.api.nvim_buf_set_lines(state.buf, 0, -1, false, { '' })

        local result = popup.copy_and_close()
        assert.is_false(result)
        assert.is_false(popup.is_open())
      end
    end)

    it('should reset has_result flag after closing', function()
      local state = popup.open()
      if state then
        popup.has_result = true
        vim.api.nvim_buf_set_lines(state.buf, 0, -1, false, { 'test' })

        popup.copy_and_close()
        assert.is_false(popup.has_result)
      end
    end)
  end)

  describe('retry', function()
    it('should not error when popup is not open', function()
      assert.has_no_errors(function()
        popup.retry()
      end)
    end)

    it('should not error when stored_input is nil', function()
      local state = popup.open()
      if state then
        popup.stored_input = nil
        assert.has_no_errors(function()
          popup.retry()
        end)
      end
    end)

    it('should not error when stored_input is empty', function()
      local state = popup.open()
      if state then
        popup.stored_input = ''
        assert.has_no_errors(function()
          popup.retry()
        end)
      end
    end)

    it('should reset has_result flag', function()
      local state = popup.open()
      if state then
        popup.stored_input = 'test input'
        popup.has_result = true
        popup.has_error = true

        popup.retry()

        assert.is_false(popup.has_result)
      end
    end)

    it('should reset has_error flag', function()
      local state = popup.open()
      if state then
        popup.stored_input = 'test input'
        popup.has_result = true
        popup.has_error = true

        popup.retry()

        assert.is_false(popup.has_error)
      end
    end)

    it('should restore stored input text', function()
      local state = popup.open()
      if state then
        popup.stored_input = 'my original text'
        popup.has_result = true
        popup.has_error = true
        vim.api.nvim_buf_set_lines(state.buf, 0, -1, false, { 'Error: something went wrong' })

        popup.retry()

        local current_text = popup.get_text()
        assert.equals('my original text', current_text)
      end
    end)

    it('should make buffer modifiable after retry', function()
      local state = popup.open()
      if state then
        popup.stored_input = 'test input'
        popup.has_error = true
        vim.api.nvim_set_option_value('modifiable', false, { buf = state.buf })

        popup.retry()

        local modifiable = vim.api.nvim_get_option_value('modifiable', { buf = state.buf })
        assert.is_true(modifiable)
      end
    end)
  end)

  describe('error handling in submit', function()
    local original_translate
    local original_get_api_key

    before_each(function()
      original_translate = api.translate
      original_get_api_key = config.get_api_key
    end)

    after_each(function()
      api.translate = original_translate
      config.get_api_key = original_get_api_key
    end)

    it('should set has_error flag on network error', function()
      local state = popup.open()
      if state then
        config.set({ target_language = 'it', source_language = 'en' })
        config.get_api_key = function()
          return 'test-api-key'
        end

        -- Mock a network error
        api.translate = function()
          return {
            success = false,
            error = {
              message = 'Network request failed',
              code = 'HTTP_ERROR',
            },
          }
        end

        vim.api.nvim_buf_set_lines(state.buf, 0, -1, false, { 'hello' })
        popup.submit()

        assert.is_true(popup.has_error)
        assert.is_true(popup.has_result)
      end
    end)

    it('should display error message in popup on network error', function()
      local state = popup.open()
      if state then
        config.set({ target_language = 'it', source_language = 'en' })
        config.get_api_key = function()
          return 'test-api-key'
        end

        api.translate = function()
          return {
            success = false,
            error = {
              message = 'Network request failed',
              code = 'HTTP_ERROR',
            },
          }
        end

        vim.api.nvim_buf_set_lines(state.buf, 0, -1, false, { 'hello' })
        popup.submit()

        local text = popup.get_text()
        assert.truthy(string.match(text, 'Error:'))
        assert.truthy(string.match(text, 'Network request failed'))
      end
    end)

    it('should display error message for invalid API key', function()
      local state = popup.open()
      if state then
        config.set({ target_language = 'it', source_language = 'en' })
        config.get_api_key = function()
          return 'invalid-key'
        end

        api.translate = function()
          return {
            success = false,
            error = {
              message = '[400] API key not valid. Please pass a valid API key.',
              code = 'API_ERROR',
            },
          }
        end

        vim.api.nvim_buf_set_lines(state.buf, 0, -1, false, { 'hello' })
        popup.submit()

        local text = popup.get_text()
        assert.truthy(string.match(text, 'Error:'))
        assert.truthy(string.match(text, 'API key'))
      end
    end)

    it('should display error message for quota exceeded', function()
      local state = popup.open()
      if state then
        config.set({ target_language = 'it', source_language = 'en' })
        config.get_api_key = function()
          return 'test-api-key'
        end

        api.translate = function()
          return {
            success = false,
            error = {
              message = '[403] Quota exceeded for quota metric',
              code = 'API_ERROR',
            },
          }
        end

        vim.api.nvim_buf_set_lines(state.buf, 0, -1, false, { 'hello' })
        popup.submit()

        local text = popup.get_text()
        assert.truthy(string.match(text, 'Error:'))
        assert.truthy(string.match(text, 'Quota'))
      end
    end)

    it('should store input text for retry', function()
      local state = popup.open()
      if state then
        config.set({ target_language = 'it', source_language = 'en' })
        config.get_api_key = function()
          return 'test-api-key'
        end

        api.translate = function()
          return {
            success = false,
            error = {
              message = 'Network error',
              code = 'HTTP_ERROR',
            },
          }
        end

        vim.api.nvim_buf_set_lines(state.buf, 0, -1, false, { 'hello world' })
        popup.submit()

        assert.equals('hello world', popup.stored_input)
      end
    end)

    it('should not set has_error on success', function()
      local state = popup.open()
      if state then
        config.set({ target_language = 'it', source_language = 'en' })
        config.get_api_key = function()
          return 'test-api-key'
        end

        api.translate = function()
          return {
            success = true,
            text = 'ciao mondo',
          }
        end

        vim.api.nvim_buf_set_lines(state.buf, 0, -1, false, { 'hello world' })
        popup.submit()

        assert.is_false(popup.has_error)
        assert.is_true(popup.has_result)
      end
    end)

    it('should allow retry after error restoring input', function()
      local state = popup.open()
      if state then
        config.set({ target_language = 'it', source_language = 'en' })
        config.get_api_key = function()
          return 'test-api-key'
        end

        -- First call fails
        api.translate = function()
          return {
            success = false,
            error = {
              message = 'Network error',
              code = 'HTTP_ERROR',
            },
          }
        end

        vim.api.nvim_buf_set_lines(state.buf, 0, -1, false, { 'hello world' })
        popup.submit()

        -- Verify error state
        assert.is_true(popup.has_error)
        assert.equals('hello world', popup.stored_input)

        -- Retry
        popup.retry()

        -- Verify input restored and ready for new submission
        assert.is_false(popup.has_error)
        assert.is_false(popup.has_result)
        assert.equals('hello world', popup.get_text())
      end
    end)
  end)
end)
