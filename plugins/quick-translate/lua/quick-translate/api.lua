--- API module for quick-translate
--- Handles Google Cloud Translation API v2 requests
--- @module quick-translate.api

local config = require('quick-translate.config')

local M = {}

--- Google Cloud Translation API v2 base URL
M.BASE_URL = 'https://translation.googleapis.com/language/translate/v2'

--- URL-encode a string
--- @param str string String to encode
--- @return string Encoded string
function M.url_encode(str)
  if str then
    str = string.gsub(str, '\n', '\r\n')
    str = string.gsub(str, '([^%w _%%%-%.~])', function(c)
      return string.format('%%%02X', string.byte(c))
    end)
    str = string.gsub(str, ' ', '+')
  end
  return str
end

--- Parse JSON string to Lua table
--- Uses vim.json.decode which is built into Neovim
--- @param json_str string JSON string to parse
--- @return table|nil, string|nil Parsed table or nil, error message if failed
function M.parse_json(json_str)
  if not json_str or json_str == '' then
    return nil, 'Empty JSON response'
  end

  local ok, result = pcall(vim.json.decode, json_str)
  if not ok then
    return nil, 'Failed to parse JSON: ' .. tostring(result)
  end

  return result, nil
end

--- Extract translated text from API response
--- @param response table Parsed API response
--- @return string|nil, string|nil Translated text or nil, error message if failed
function M.extract_translation(response)
  if not response then
    return nil, 'Empty response'
  end

  -- Check for API error response
  if response.error then
    local error_msg = 'API error'
    if response.error.message then
      error_msg = response.error.message
    end
    if response.error.code then
      error_msg = string.format('[%d] %s', response.error.code, error_msg)
    end
    return nil, error_msg
  end

  -- Extract translation from successful response
  -- Response structure: { data: { translations: [{ translatedText: "..." }] } }
  if response.data and response.data.translations and #response.data.translations > 0 then
    local translation = response.data.translations[1]
    if translation and translation.translatedText then
      return translation.translatedText, nil
    end
  end

  return nil, 'Unexpected response format: missing translation data'
end

--- Build the API request URL
--- @param text string Text to translate
--- @param source_lang string Source language code (or 'auto')
--- @param target_lang string Target language code
--- @return string|nil, string|nil URL or nil, error message if failed
function M.build_url(text, source_lang, target_lang)
  local api_key = config.get_api_key()
  if not api_key or api_key == '' then
    return nil, 'API key not configured'
  end

  if not text or text == '' then
    return nil, 'Text to translate is empty'
  end

  if not target_lang or target_lang == '' then
    return nil, 'Target language is required'
  end

  local url = M.BASE_URL .. '?key=' .. M.url_encode(api_key)
  url = url .. '&q=' .. M.url_encode(text)
  url = url .. '&target=' .. M.url_encode(target_lang)

  -- Only add source if not 'auto' (API will auto-detect if not specified)
  if source_lang and source_lang ~= '' and source_lang ~= 'auto' then
    url = url .. '&source=' .. M.url_encode(source_lang)
  end

  return url, nil
end

--- Create a structured error result
--- @param message string Error message
--- @param code string|nil Error code (optional)
--- @return table Error result table
function M.create_error(message, code)
  return {
    success = false,
    error = {
      message = message,
      code = code or 'UNKNOWN_ERROR',
    },
  }
end

--- Create a structured success result
--- @param translated_text string Translated text
--- @return table Success result table
function M.create_success(translated_text)
  return {
    success = true,
    text = translated_text,
  }
end

--- Translate text using Google Cloud Translation API v2
--- Uses vim.system for async HTTP requests (Neovim 0.10+) or curl fallback
--- @param text string Text to translate
--- @param source_lang string Source language code (or 'auto' for auto-detect)
--- @param target_lang string Target language code
--- @param callback function|nil Optional callback for async operation: callback(result)
--- @return table|nil Sync: returns result table, Async with callback: returns nil
function M.translate(text, source_lang, target_lang, callback)
  -- Build URL
  local url, url_err = M.build_url(text, source_lang, target_lang)
  if not url then
    local error_result = M.create_error(url_err or 'Failed to build URL', 'URL_BUILD_ERROR')
    if callback then
      callback(error_result)
      return nil
    end
    return error_result
  end

  -- Build curl command arguments
  local curl_args = {
    'curl',
    '-s', -- Silent mode
    '-S', -- Show errors
    '-f', -- Fail silently on HTTP errors (returns exit code)
    '--max-time', '30', -- 30 second timeout
    url,
  }

  -- Check if vim.system is available (Neovim 0.10+)
  if vim.system then
    if callback then
      -- Async mode
      vim.system(curl_args, { text = true }, function(result)
        vim.schedule(function()
          callback(M.handle_curl_result(result))
        end)
      end)
      return nil
    else
      -- Sync mode with vim.system
      local result = vim.system(curl_args, { text = true }):wait()
      return M.handle_curl_result(result)
    end
  else
    -- Fallback for older Neovim versions using vim.fn.system
    local cmd = table.concat(curl_args, ' ')
    local output = vim.fn.system(cmd)
    local exit_code = vim.v.shell_error

    local result = {
      code = exit_code,
      stdout = output,
      stderr = '',
    }

    local api_result = M.handle_curl_result(result)
    if callback then
      callback(api_result)
      return nil
    end
    return api_result
  end
end

--- Handle the result from curl execution
--- @param result table Result from vim.system or equivalent
--- @return table Structured result table
function M.handle_curl_result(result)
  -- Check for curl execution errors
  if result.code ~= 0 then
    local error_msg = 'HTTP request failed'
    if result.stderr and result.stderr ~= '' then
      error_msg = error_msg .. ': ' .. result.stderr
    elseif result.code == 22 then
      error_msg = 'HTTP error response from server'
    elseif result.code == 28 then
      error_msg = 'Request timeout'
    elseif result.code == 6 then
      error_msg = 'Could not resolve host'
    elseif result.code == 7 then
      error_msg = 'Could not connect to server'
    end
    return M.create_error(error_msg, 'HTTP_ERROR')
  end

  -- Parse JSON response
  local response, parse_err = M.parse_json(result.stdout)
  if not response then
    return M.create_error(parse_err or 'Failed to parse response', 'PARSE_ERROR')
  end

  -- Extract translation
  local translated_text, extract_err = M.extract_translation(response)
  if not translated_text then
    return M.create_error(extract_err or 'Failed to extract translation', 'API_ERROR')
  end

  return M.create_success(translated_text)
end

return M
