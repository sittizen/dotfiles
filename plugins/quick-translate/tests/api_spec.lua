-- Tests for quick-translate API module (US-007: Google Cloud Translation API Integration)
local api = require('quick-translate.api')

describe('api module', function()
  describe('url_encode', function()
    it('should encode spaces as plus signs', function()
      assert.equals('hello+world', api.url_encode('hello world'))
    end)

    it('should encode special characters', function()
      assert.equals('hello%26world', api.url_encode('hello&world'))
      assert.equals('test%3Dvalue', api.url_encode('test=value'))
      assert.equals('question%3F', api.url_encode('question?'))
    end)

    it('should not encode alphanumeric characters', function()
      assert.equals('hello123', api.url_encode('hello123'))
    end)

    it('should handle empty string', function()
      assert.equals('', api.url_encode(''))
    end)

    it('should encode unicode characters', function()
      local encoded = api.url_encode('ciao mondo')
      assert.equals('ciao+mondo', encoded)
    end)

    it('should convert newlines to CRLF before encoding', function()
      local encoded = api.url_encode('line1\nline2')
      assert.equals('line1%0D%0Aline2', encoded)
    end)
  end)

  describe('parse_json', function()
    it('should parse valid JSON object', function()
      local result, err = api.parse_json('{"key": "value"}')
      assert.is_nil(err)
      assert.is_table(result)
      assert.equals('value', result.key)
    end)

    it('should parse valid JSON array', function()
      local result, err = api.parse_json('[1, 2, 3]')
      assert.is_nil(err)
      assert.is_table(result)
      assert.equals(3, #result)
    end)

    it('should return error for invalid JSON', function()
      local result, err = api.parse_json('not valid json')
      assert.is_nil(result)
      assert.is_string(err)
      assert.is_truthy(string.find(err, 'Failed to parse JSON'))
    end)

    it('should return error for empty string', function()
      local result, err = api.parse_json('')
      assert.is_nil(result)
      assert.equals('Empty JSON response', err)
    end)

    it('should return error for nil input', function()
      local result, err = api.parse_json(nil)
      assert.is_nil(result)
      assert.equals('Empty JSON response', err)
    end)
  end)

  describe('extract_translation', function()
    it('should extract translation from valid response', function()
      local response = {
        data = {
          translations = {
            { translatedText = 'Hello world' }
          }
        }
      }
      local text, err = api.extract_translation(response)
      assert.is_nil(err)
      assert.equals('Hello world', text)
    end)

    it('should return error for API error response', function()
      local response = {
        error = {
          code = 400,
          message = 'Invalid API key'
        }
      }
      local text, err = api.extract_translation(response)
      assert.is_nil(text)
      assert.is_truthy(string.find(err, '400'))
      assert.is_truthy(string.find(err, 'Invalid API key'))
    end)

    it('should handle API error without code', function()
      local response = {
        error = {
          message = 'Something went wrong'
        }
      }
      local text, err = api.extract_translation(response)
      assert.is_nil(text)
      assert.is_truthy(string.find(err, 'Something went wrong'))
    end)

    it('should return error for empty response', function()
      local text, err = api.extract_translation(nil)
      assert.is_nil(text)
      assert.equals('Empty response', err)
    end)

    it('should return error for missing data field', function()
      local response = {}
      local text, err = api.extract_translation(response)
      assert.is_nil(text)
      assert.is_truthy(string.find(err, 'Unexpected response format'))
    end)

    it('should return error for missing translations array', function()
      local response = { data = {} }
      local text, err = api.extract_translation(response)
      assert.is_nil(text)
      assert.is_truthy(string.find(err, 'Unexpected response format'))
    end)

    it('should return error for empty translations array', function()
      local response = { data = { translations = {} } }
      local text, err = api.extract_translation(response)
      assert.is_nil(text)
      assert.is_truthy(string.find(err, 'Unexpected response format'))
    end)
  end)

  describe('build_url', function()
    -- Save and restore original get_api_key function for mocking
    local original_get_api_key

    before_each(function()
      original_get_api_key = require('quick-translate.config').get_api_key
    end)

    after_each(function()
      require('quick-translate.config').get_api_key = original_get_api_key
    end)

    it('should build URL with all parameters', function()
      require('quick-translate.config').get_api_key = function()
        return 'test_api_key'
      end

      local url, err = api.build_url('hello', 'en', 'it')
      assert.is_nil(err)
      assert.is_truthy(string.find(url, 'translation.googleapis.com'))
      assert.is_truthy(string.find(url, 'key=test_api_key'))
      assert.is_truthy(string.find(url, 'q=hello'))
      assert.is_truthy(string.find(url, 'target=it'))
      assert.is_truthy(string.find(url, 'source=en'))
    end)

    it('should omit source when set to auto', function()
      require('quick-translate.config').get_api_key = function()
        return 'test_api_key'
      end

      local url, err = api.build_url('hello', 'auto', 'it')
      assert.is_nil(err)
      assert.is_falsy(string.find(url, 'source='))
    end)

    it('should omit source when empty', function()
      require('quick-translate.config').get_api_key = function()
        return 'test_api_key'
      end

      local url, err = api.build_url('hello', '', 'it')
      assert.is_nil(err)
      assert.is_falsy(string.find(url, 'source='))
    end)

    it('should return error when API key is not set', function()
      require('quick-translate.config').get_api_key = function()
        return nil
      end

      local url, err = api.build_url('hello', 'en', 'it')
      assert.is_nil(url)
      assert.equals('API key not configured', err)
    end)

    it('should return error when API key is empty', function()
      require('quick-translate.config').get_api_key = function()
        return ''
      end

      local url, err = api.build_url('hello', 'en', 'it')
      assert.is_nil(url)
      assert.equals('API key not configured', err)
    end)

    it('should return error when text is empty', function()
      require('quick-translate.config').get_api_key = function()
        return 'test_api_key'
      end

      local url, err = api.build_url('', 'en', 'it')
      assert.is_nil(url)
      assert.equals('Text to translate is empty', err)
    end)

    it('should return error when text is nil', function()
      require('quick-translate.config').get_api_key = function()
        return 'test_api_key'
      end

      local url, err = api.build_url(nil, 'en', 'it')
      assert.is_nil(url)
      assert.equals('Text to translate is empty', err)
    end)

    it('should return error when target language is empty', function()
      require('quick-translate.config').get_api_key = function()
        return 'test_api_key'
      end

      local url, err = api.build_url('hello', 'en', '')
      assert.is_nil(url)
      assert.equals('Target language is required', err)
    end)

    it('should URL-encode text with special characters', function()
      require('quick-translate.config').get_api_key = function()
        return 'test_api_key'
      end

      local url, err = api.build_url('hello world', 'en', 'it')
      assert.is_nil(err)
      assert.is_truthy(string.find(url, 'q=hello%+world'))
    end)
  end)

  describe('create_error', function()
    it('should create structured error with message and code', function()
      local result = api.create_error('Something went wrong', 'TEST_ERROR')
      assert.is_false(result.success)
      assert.is_table(result.error)
      assert.equals('Something went wrong', result.error.message)
      assert.equals('TEST_ERROR', result.error.code)
    end)

    it('should use default error code when not provided', function()
      local result = api.create_error('Something went wrong')
      assert.equals('UNKNOWN_ERROR', result.error.code)
    end)
  end)

  describe('create_success', function()
    it('should create structured success result', function()
      local result = api.create_success('Translated text')
      assert.is_true(result.success)
      assert.equals('Translated text', result.text)
    end)
  end)

  describe('handle_curl_result', function()
    it('should handle successful response', function()
      local curl_result = {
        code = 0,
        stdout = '{"data":{"translations":[{"translatedText":"Ciao mondo"}]}}',
        stderr = '',
      }
      local result = api.handle_curl_result(curl_result)
      assert.is_true(result.success)
      assert.equals('Ciao mondo', result.text)
    end)

    it('should handle HTTP error with non-zero exit code', function()
      local curl_result = {
        code = 22,
        stdout = '',
        stderr = '',
      }
      local result = api.handle_curl_result(curl_result)
      assert.is_false(result.success)
      assert.equals('HTTP_ERROR', result.error.code)
      assert.is_truthy(string.find(result.error.message, 'HTTP error'))
    end)

    it('should handle timeout error', function()
      local curl_result = {
        code = 28,
        stdout = '',
        stderr = '',
      }
      local result = api.handle_curl_result(curl_result)
      assert.is_false(result.success)
      assert.is_truthy(string.find(result.error.message, 'timeout'))
    end)

    it('should handle DNS resolution error', function()
      local curl_result = {
        code = 6,
        stdout = '',
        stderr = '',
      }
      local result = api.handle_curl_result(curl_result)
      assert.is_false(result.success)
      assert.is_truthy(string.find(result.error.message, 'resolve host'))
    end)

    it('should handle connection error', function()
      local curl_result = {
        code = 7,
        stdout = '',
        stderr = '',
      }
      local result = api.handle_curl_result(curl_result)
      assert.is_false(result.success)
      assert.is_truthy(string.find(result.error.message, 'connect'))
    end)

    it('should handle invalid JSON response', function()
      local curl_result = {
        code = 0,
        stdout = 'not valid json',
        stderr = '',
      }
      local result = api.handle_curl_result(curl_result)
      assert.is_false(result.success)
      assert.equals('PARSE_ERROR', result.error.code)
    end)

    it('should handle API error in response', function()
      local curl_result = {
        code = 0,
        stdout = '{"error":{"code":403,"message":"Daily limit exceeded"}}',
        stderr = '',
      }
      local result = api.handle_curl_result(curl_result)
      assert.is_false(result.success)
      assert.equals('API_ERROR', result.error.code)
      assert.is_truthy(string.find(result.error.message, 'Daily limit exceeded'))
    end)
  end)

  describe('translate', function()
    local original_get_api_key

    before_each(function()
      original_get_api_key = require('quick-translate.config').get_api_key
    end)

    after_each(function()
      require('quick-translate.config').get_api_key = original_get_api_key
    end)

    it('should return error when API key is not configured', function()
      require('quick-translate.config').get_api_key = function()
        return nil
      end

      local result = api.translate('hello', 'en', 'it')
      assert.is_false(result.success)
      assert.equals('URL_BUILD_ERROR', result.error.code)
      assert.is_truthy(string.find(result.error.message, 'API key'))
    end)

    it('should return error for empty text', function()
      require('quick-translate.config').get_api_key = function()
        return 'test_key'
      end

      local result = api.translate('', 'en', 'it')
      assert.is_false(result.success)
      assert.equals('URL_BUILD_ERROR', result.error.code)
    end)

    it('should return error for missing target language', function()
      require('quick-translate.config').get_api_key = function()
        return 'test_key'
      end

      local result = api.translate('hello', 'en', '')
      assert.is_false(result.success)
      assert.equals('URL_BUILD_ERROR', result.error.code)
    end)
  end)

  describe('BASE_URL', function()
    it('should be the Google Cloud Translation API v2 endpoint', function()
      assert.is_truthy(string.find(api.BASE_URL, 'translation.googleapis.com'))
      assert.is_truthy(string.find(api.BASE_URL, '/v2'))
    end)
  end)
end)
