import { describe, it, expect } from 'vitest'
import { loadConfig } from '../../../src/core/config.js'
import type { Env } from '../../../src/core/types.js'

describe('AI Gateway Configuration', () => {
  const baseEnv: Env = {
    OPENAI_API_KEY: 'sk-test',
    QDRANT_API_KEY: 'test-key',
    QDRANT_CLOUD_URL: 'https://test.qdrant.io',
    QDRANT_COLLECTION: 'test-collection',
    TELEGRAM_BOT_TOKEN: 'test-token',
    WEBHOOK_SECRET_TOKEN: 'test-secret',
  }

  describe('AI Gateway URL Configuration', () => {
    it('should use default OpenAI endpoints when AI Gateway is not configured', () => {
      const config = loadConfig(baseEnv)
      
      expect(config.openai).toEqual({
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
        gatewayEnabled: false
      })
    })

    it('should configure AI Gateway when CF_AI_GATEWAY_ACCOUNT_ID and CF_AI_GATEWAY_NAME are provided', () => {
      const envWithGateway: Env = {
        ...baseEnv,
        CF_AI_GATEWAY_ACCOUNT_ID: 'account123',
        CF_AI_GATEWAY_NAME: 'my-gateway'
      }

      const config = loadConfig(envWithGateway)
      
      expect(config.openai).toEqual({
        apiKey: 'sk-test',
        baseUrl: 'https://gateway.ai.cloudflare.com/v1/account123/my-gateway/openai',
        gatewayEnabled: true
      })
    })

    it('should throw error when only one AI Gateway parameter is provided', () => {
      const envMissingName: Env = {
        ...baseEnv,
        CF_AI_GATEWAY_ACCOUNT_ID: 'account123'
      }

      expect(() => loadConfig(envMissingName))
        .toThrow('Both CF_AI_GATEWAY_ACCOUNT_ID and CF_AI_GATEWAY_NAME are required for AI Gateway')
    })

    it('should throw error when only AI Gateway name is provided', () => {
      const envMissingAccount: Env = {
        ...baseEnv,
        CF_AI_GATEWAY_NAME: 'my-gateway'
      }

      expect(() => loadConfig(envMissingAccount))
        .toThrow('Both CF_AI_GATEWAY_ACCOUNT_ID and CF_AI_GATEWAY_NAME are required for AI Gateway')
    })

    it('should validate AI Gateway account ID format', () => {
      const envInvalidAccount: Env = {
        ...baseEnv,
        CF_AI_GATEWAY_ACCOUNT_ID: '',
        CF_AI_GATEWAY_NAME: 'my-gateway'
      }

      expect(() => loadConfig(envInvalidAccount))
        .toThrow('CF_AI_GATEWAY_ACCOUNT_ID cannot be empty')
    })

    it('should validate AI Gateway name format', () => {
      const envInvalidName: Env = {
        ...baseEnv,
        CF_AI_GATEWAY_ACCOUNT_ID: 'account123',
        CF_AI_GATEWAY_NAME: ''
      }

      expect(() => loadConfig(envInvalidName))
        .toThrow('CF_AI_GATEWAY_NAME cannot be empty')
    })

    it('should allow custom base URL override', () => {
      const envWithCustomUrl: Env = {
        ...baseEnv,
        CF_AI_GATEWAY_BASE_URL: 'https://custom-gateway.example.com/v1/openai'
      }

      const config = loadConfig(envWithCustomUrl)
      
      expect(config.openai).toEqual({
        apiKey: 'sk-test',
        baseUrl: 'https://custom-gateway.example.com/v1/openai',
        gatewayEnabled: true
      })
    })
  })
})