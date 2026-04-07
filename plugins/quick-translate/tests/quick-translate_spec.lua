-- Tests for quick-translate plugin (US-001: Plugin Setup and Configuration)
local quick_translate = require('quick-translate')
local config = require('quick-translate.config')

describe('quick-translate', function()
  -- Reset config before each test
  before_each(function()
    config.set(nil)
  end)

  describe('setup', function()
    it('should expose setup function', function()
      assert.is_function(quick_translate.setup)
    end)

    it('should accept empty options', function()
      quick_translate.setup()
      local cfg = quick_translate.get_config()
      assert.is_table(cfg)
    end)

    it('should accept target_language option', function()
      quick_translate.setup({ target_language = 'en' })
      local cfg = quick_translate.get_config()
      assert.equals('en', cfg.target_language)
    end)

    it('should accept source_language option', function()
      quick_translate.setup({ source_language = 'it' })
      local cfg = quick_translate.get_config()
      assert.equals('it', cfg.source_language)
    end)

    it('should default source_language to auto', function()
      quick_translate.setup({ target_language = 'en' })
      local cfg = quick_translate.get_config()
      assert.equals('auto', cfg.source_language)
    end)

    it('should accept keymap option', function()
      quick_translate.setup({ keymap = '<leader>t' })
      local cfg = quick_translate.get_config()
      assert.equals('<leader>t', cfg.keymap)
    end)

    it('should not set keymap by default', function()
      quick_translate.setup()
      local cfg = quick_translate.get_config()
      assert.is_nil(cfg.keymap)
    end)
  end)

  describe('config', function()
    it('should return nil before setup', function()
      assert.is_nil(quick_translate.get_config())
    end)

    it('should return config after setup', function()
      quick_translate.setup({ target_language = 'es' })
      local cfg = quick_translate.get_config()
      assert.is_not_nil(cfg)
      assert.equals('es', cfg.target_language)
    end)
  end)

  describe('api key validation', function()
    it('should have validate_api_key function', function()
      assert.is_function(config.validate_api_key)
    end)

    it('should have get_api_key function', function()
      assert.is_function(config.get_api_key)
    end)

    -- Note: We can't easily test the actual API key validation
    -- without mocking os.getenv, which plenary doesn't provide
    -- The actual validation is tested implicitly through the open() function
  end)
end)

describe('config module', function()
  before_each(function()
    config.set(nil)
  end)

  describe('defaults', function()
    it('should have default values', function()
      assert.is_table(config.defaults)
      assert.equals('auto', config.defaults.source_language)
      assert.is_nil(config.defaults.target_language)
      assert.is_nil(config.defaults.keymap)
    end)
  end)

  describe('merge', function()
    it('should merge user options with defaults', function()
      local result = config.merge({ target_language = 'fr' })
      assert.equals('fr', result.target_language)
      assert.equals('auto', result.source_language)
    end)

    it('should handle nil options', function()
      local result = config.merge(nil)
      assert.is_table(result)
      assert.equals('auto', result.source_language)
    end)

    it('should override defaults with user values', function()
      local result = config.merge({ source_language = 'de' })
      assert.equals('de', result.source_language)
    end)
  end)

  describe('is_setup', function()
    it('should return false before setup', function()
      assert.is_false(config.is_setup())
    end)

    it('should return true after setup', function()
      config.set({})
      assert.is_true(config.is_setup())
    end)
  end)
end)
