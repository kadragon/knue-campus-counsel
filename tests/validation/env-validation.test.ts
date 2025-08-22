import { describe, it, expect } from 'vitest'
import { validateEnv, assertValidEnv } from '../../src/validation/env-validation.js'
import type { Env } from '../../src/core/types.js'

describe('Environment Validation', () => {
  describe('validateEnv', () => {
    describe('Required fields validation', () => {
      it('should pass with all required fields present', () => {
        const env: Env = {
          OPENAI_API_KEY: 'sk-test',
          QDRANT_API_KEY: 'qdrant-key',
          TELEGRAM_BOT_TOKEN: 'bot-token',
          WEBHOOK_SECRET_TOKEN: 'webhook-secret',
          QDRANT_URL: 'https://qdrant.example.com',
          QDRANT_COLLECTION: 'test-collection',
        }

        const result = validateEnv(env)
        expect(result.ok).toBe(true)
        expect(result.errors).toHaveLength(0)
        expect(result.warnings).toHaveLength(0)
      })

      it('should require OPENAI_API_KEY', () => {
        const env = {
          QDRANT_API_KEY: 'qdrant-key',
          TELEGRAM_BOT_TOKEN: 'bot-token',
          QDRANT_URL: 'https://qdrant.example.com',
          QDRANT_COLLECTION: 'test-collection',
        } as any

        const result = validateEnv(env)
        expect(result.ok).toBe(false)
        expect(result.errors).toContainEqual({
          type: 'error',
          field: 'OPENAI_API_KEY',
          message: 'required'
        })
      })

      it('should require QDRANT_API_KEY', () => {
        const env = {
          OPENAI_API_KEY: 'sk-test',
          TELEGRAM_BOT_TOKEN: 'bot-token',
          QDRANT_URL: 'https://qdrant.example.com',
          QDRANT_COLLECTION: 'test-collection',
        } as any

        const result = validateEnv(env)
        expect(result.ok).toBe(false)
        expect(result.errors).toContainEqual({
          type: 'error',
          field: 'QDRANT_API_KEY',
          message: 'required'
        })
      })

      it('should require TELEGRAM_BOT_TOKEN', () => {
        const env = {
          OPENAI_API_KEY: 'sk-test',
          QDRANT_API_KEY: 'qdrant-key',
          QDRANT_URL: 'https://qdrant.example.com',
          QDRANT_COLLECTION: 'test-collection',
        } as any

        const result = validateEnv(env)
        expect(result.ok).toBe(false)
        expect(result.errors).toContainEqual({
          type: 'error',
          field: 'TELEGRAM_BOT_TOKEN',
          message: 'required'
        })
      })

      it('should collect multiple missing required fields', () => {
        const env = {} as Env

        const result = validateEnv(env)
        expect(result.ok).toBe(false)
        expect(result.errors).toHaveLength(5) // 3 required + 2 Qdrant fields
        expect(result.errors.map(e => e.field)).toContain('OPENAI_API_KEY')
        expect(result.errors.map(e => e.field)).toContain('QDRANT_API_KEY')
        expect(result.errors.map(e => e.field)).toContain('TELEGRAM_BOT_TOKEN')
      })
    })

    describe('Qdrant configuration validation', () => {
      it('should accept QDRANT_URL', () => {
        const env = {
          OPENAI_API_KEY: 'sk-test',
          QDRANT_API_KEY: 'qdrant-key',
          TELEGRAM_BOT_TOKEN: 'bot-token',
          QDRANT_URL: 'https://qdrant.example.com',
          QDRANT_COLLECTION: 'test-collection',
        } as Env

        const result = validateEnv(env)
        expect(result.ok).toBe(true)
      })

      it('should accept QDRANT_CLOUD_URL as alternative', () => {
        const env = {
          OPENAI_API_KEY: 'sk-test',
          QDRANT_API_KEY: 'qdrant-key',
          TELEGRAM_BOT_TOKEN: 'bot-token',
          QDRANT_CLOUD_URL: 'https://cloud.qdrant.io',
          QDRANT_COLLECTION: 'test-collection',
        } as Env

        const result = validateEnv(env)
        expect(result.ok).toBe(true)
      })

      it('should require either QDRANT_URL or QDRANT_CLOUD_URL', () => {
        const env = {
          OPENAI_API_KEY: 'sk-test',
          QDRANT_API_KEY: 'qdrant-key',
          TELEGRAM_BOT_TOKEN: 'bot-token',
          QDRANT_COLLECTION: 'test-collection',
        } as Env

        const result = validateEnv(env)
        expect(result.ok).toBe(false)
        expect(result.errors).toContainEqual({
          type: 'error',
          field: 'QDRANT_URL|QDRANT_CLOUD_URL',
          message: 'one of these is required'
        })
      })

      it('should accept QDRANT_COLLECTION', () => {
        const env = {
          OPENAI_API_KEY: 'sk-test',
          QDRANT_API_KEY: 'qdrant-key',
          TELEGRAM_BOT_TOKEN: 'bot-token',
          QDRANT_URL: 'https://qdrant.example.com',
          QDRANT_COLLECTION: 'test-collection',
        } as Env

        const result = validateEnv(env)
        expect(result.ok).toBe(true)
      })

      it('should accept COLLECTION_NAME as alternative', () => {
        const env = {
          OPENAI_API_KEY: 'sk-test',
          QDRANT_API_KEY: 'qdrant-key',
          TELEGRAM_BOT_TOKEN: 'bot-token',
          QDRANT_URL: 'https://qdrant.example.com',
          COLLECTION_NAME: 'legacy-collection',
        } as Env

        const result = validateEnv(env)
        expect(result.ok).toBe(true)
      })

      it('should require either QDRANT_COLLECTION or COLLECTION_NAME', () => {
        const env = {
          OPENAI_API_KEY: 'sk-test',
          QDRANT_API_KEY: 'qdrant-key',
          TELEGRAM_BOT_TOKEN: 'bot-token',
          QDRANT_URL: 'https://qdrant.example.com',
        } as Env

        const result = validateEnv(env)
        expect(result.ok).toBe(false)
        expect(result.errors).toContainEqual({
          type: 'error',
          field: 'QDRANT_COLLECTION|COLLECTION_NAME',
          message: 'one of these is required'
        })
      })
    })

    describe('Webhook secret validation', () => {
      it('should warn when WEBHOOK_SECRET_TOKEN is missing', () => {
        const env = {
          OPENAI_API_KEY: 'sk-test',
          QDRANT_API_KEY: 'qdrant-key',
          TELEGRAM_BOT_TOKEN: 'bot-token',
          QDRANT_URL: 'https://qdrant.example.com',
          QDRANT_COLLECTION: 'test-collection',
        } as Env

        const result = validateEnv(env)
        expect(result.ok).toBe(true) // warnings don't fail validation
        expect(result.warnings).toContainEqual({
          type: 'warning',
          field: 'WEBHOOK_SECRET_TOKEN',
          message: 'missing; /ask and /telegram webhook protection recommended'
        })
      })

      it('should not warn when WEBHOOK_SECRET_TOKEN is present', () => {
        const env = {
          OPENAI_API_KEY: 'sk-test',
          QDRANT_API_KEY: 'qdrant-key',
          TELEGRAM_BOT_TOKEN: 'bot-token',
          WEBHOOK_SECRET_TOKEN: 'webhook-secret',
          QDRANT_URL: 'https://qdrant.example.com',
          QDRANT_COLLECTION: 'test-collection',
        } as Env

        const result = validateEnv(env)
        expect(result.warnings).toHaveLength(0)
      })
    })

    describe('Numeric field validation', () => {
      describe('Search configuration', () => {
        it('should accept valid BOARD_COLLECTION_TOP_K values', () => {
          const validValues = [1, 10, 25, 50]
          
          for (const value of validValues) {
            const env = {
              OPENAI_API_KEY: 'sk-test',
              QDRANT_API_KEY: 'qdrant-key',
              TELEGRAM_BOT_TOKEN: 'bot-token',
              QDRANT_URL: 'https://qdrant.example.com',
              QDRANT_COLLECTION: 'test-collection',
              BOARD_COLLECTION_TOP_K: value.toString(),
            } as Env

            const result = validateEnv(env)
            expect(result.ok).toBe(true)
          }
        })

        it('should reject invalid BOARD_COLLECTION_TOP_K values', () => {
          const invalidValues = [0, -1, 51, 100, 'invalid'] // removed empty string as it's handled as undefined
          
          for (const value of invalidValues) {
            const env = {
              OPENAI_API_KEY: 'sk-test',
              QDRANT_API_KEY: 'qdrant-key',
              TELEGRAM_BOT_TOKEN: 'bot-token',
              QDRANT_URL: 'https://qdrant.example.com',
              QDRANT_COLLECTION: 'test-collection',
              BOARD_COLLECTION_TOP_K: value.toString(),
            } as Env

            const result = validateEnv(env)
            expect(result.ok).toBe(false)
            expect(result.errors).toContainEqual({
              type: 'error',
              field: 'BOARD_COLLECTION_TOP_K',
              message: 'must be an integer between 1 and 50'
            })
          }
        })

        it('should accept valid POLICY_COLLECTION_TOP_K values', () => {
          const validValues = [1, 10, 25, 50]
          
          for (const value of validValues) {
            const env = {
              OPENAI_API_KEY: 'sk-test',
              QDRANT_API_KEY: 'qdrant-key',
              TELEGRAM_BOT_TOKEN: 'bot-token',
              QDRANT_URL: 'https://qdrant.example.com',
              QDRANT_COLLECTION: 'test-collection',
              POLICY_COLLECTION_TOP_K: value.toString(),
            } as Env

            const result = validateEnv(env)
            expect(result.ok).toBe(true)
          }
        })

        it('should reject invalid POLICY_COLLECTION_TOP_K values', () => {
          const invalidValues = [0, -1, 51, 100]
          
          for (const value of invalidValues) {
            const env = {
              OPENAI_API_KEY: 'sk-test',
              QDRANT_API_KEY: 'qdrant-key',
              TELEGRAM_BOT_TOKEN: 'bot-token',
              QDRANT_URL: 'https://qdrant.example.com',
              QDRANT_COLLECTION: 'test-collection',
              POLICY_COLLECTION_TOP_K: value.toString(),
            } as Env

            const result = validateEnv(env)
            expect(result.ok).toBe(false)
            expect(result.errors).toContainEqual({
              type: 'error',
              field: 'POLICY_COLLECTION_TOP_K',
              message: 'must be an integer between 1 and 50'
            })
          }
        })
      })

      describe('Rate limiting configuration', () => {
        it('should accept valid RATE_LIMIT_WINDOW_MS values', () => {
          const validValues = [100, 1000, 5000, 60000, 3600000]
          
          for (const value of validValues) {
            const env = {
              OPENAI_API_KEY: 'sk-test',
              QDRANT_API_KEY: 'qdrant-key',
              TELEGRAM_BOT_TOKEN: 'bot-token',
              QDRANT_URL: 'https://qdrant.example.com',
              QDRANT_COLLECTION: 'test-collection',
              RATE_LIMIT_WINDOW_MS: value.toString(),
            } as Env

            const result = validateEnv(env)
            expect(result.ok).toBe(true)
          }
        })

        it('should reject invalid RATE_LIMIT_WINDOW_MS values', () => {
          const invalidValues = [99, -1, 3600001, 0]
          
          for (const value of invalidValues) {
            const env = {
              OPENAI_API_KEY: 'sk-test',
              QDRANT_API_KEY: 'qdrant-key',
              TELEGRAM_BOT_TOKEN: 'bot-token',
              QDRANT_URL: 'https://qdrant.example.com',
              QDRANT_COLLECTION: 'test-collection',
              RATE_LIMIT_WINDOW_MS: value.toString(),
            } as Env

            const result = validateEnv(env)
            expect(result.ok).toBe(false)
            expect(result.errors).toContainEqual({
              type: 'error',
              field: 'RATE_LIMIT_WINDOW_MS',
              message: 'must be an integer between 100 and 3600000'
            })
          }
        })

        it('should accept valid RATE_LIMIT_MAX values', () => {
          const validValues = [0, 1, 10, 100, 1000]
          
          for (const value of validValues) {
            const env = {
              OPENAI_API_KEY: 'sk-test',
              QDRANT_API_KEY: 'qdrant-key',
              TELEGRAM_BOT_TOKEN: 'bot-token',
              QDRANT_URL: 'https://qdrant.example.com',
              QDRANT_COLLECTION: 'test-collection',
              RATE_LIMIT_MAX: value.toString(),
            } as Env

            const result = validateEnv(env)
            expect(result.ok).toBe(true)
          }
        })

        it('should reject invalid RATE_LIMIT_MAX values', () => {
          const invalidValues = [-1, 1001, 5000]
          
          for (const value of invalidValues) {
            const env = {
              OPENAI_API_KEY: 'sk-test',
              QDRANT_API_KEY: 'qdrant-key',
              TELEGRAM_BOT_TOKEN: 'bot-token',
              QDRANT_URL: 'https://qdrant.example.com',
              QDRANT_COLLECTION: 'test-collection',
              RATE_LIMIT_MAX: value.toString(),
            } as Env

            const result = validateEnv(env)
            expect(result.ok).toBe(false)
            expect(result.errors).toContainEqual({
              type: 'error',
              field: 'RATE_LIMIT_MAX',
              message: 'must be an integer between 0 and 1000'
            })
          }
        })
      })

      describe('Memory cache configuration', () => {
        it('should accept valid RATE_LIMIT_MEMORY_CACHE_SIZE values', () => {
          const validValues = [0, 100, 1000, 10000, 100000]
          
          for (const value of validValues) {
            const env = {
              OPENAI_API_KEY: 'sk-test',
              QDRANT_API_KEY: 'qdrant-key',
              TELEGRAM_BOT_TOKEN: 'bot-token',
              QDRANT_URL: 'https://qdrant.example.com',
              QDRANT_COLLECTION: 'test-collection',
              RATE_LIMIT_MEMORY_CACHE_SIZE: value.toString(),
            } as Env

            const result = validateEnv(env)
            expect(result.ok).toBe(true)
          }
        })

        it('should reject invalid RATE_LIMIT_MEMORY_CACHE_SIZE values', () => {
          const invalidValues = [-1, 100001, 500000]
          
          for (const value of invalidValues) {
            const env = {
              OPENAI_API_KEY: 'sk-test',
              QDRANT_API_KEY: 'qdrant-key',
              TELEGRAM_BOT_TOKEN: 'bot-token',
              QDRANT_URL: 'https://qdrant.example.com',
              QDRANT_COLLECTION: 'test-collection',
              RATE_LIMIT_MEMORY_CACHE_SIZE: value.toString(),
            } as Env

            const result = validateEnv(env)
            expect(result.ok).toBe(false)
            expect(result.errors).toContainEqual({
              type: 'error',
              field: 'RATE_LIMIT_MEMORY_CACHE_SIZE',
              message: 'must be an integer between 0 and 100000'
            })
          }
        })

        it('should accept valid RATE_LIMIT_MEMORY_CACHE_TTL values', () => {
          const validValues = [1, 1000, 60000, 3600000, 86400000]
          
          for (const value of validValues) {
            const env = {
              OPENAI_API_KEY: 'sk-test',
              QDRANT_API_KEY: 'qdrant-key',
              TELEGRAM_BOT_TOKEN: 'bot-token',
              QDRANT_URL: 'https://qdrant.example.com',
              QDRANT_COLLECTION: 'test-collection',
              RATE_LIMIT_MEMORY_CACHE_TTL: value.toString(),
            } as Env

            const result = validateEnv(env)
            expect(result.ok).toBe(true)
          }
        })

        it('should reject invalid RATE_LIMIT_MEMORY_CACHE_TTL values', () => {
          const invalidValues = [0, -1, 86400001, 172800000]
          
          for (const value of invalidValues) {
            const env = {
              OPENAI_API_KEY: 'sk-test',
              QDRANT_API_KEY: 'qdrant-key',
              TELEGRAM_BOT_TOKEN: 'bot-token',
              QDRANT_URL: 'https://qdrant.example.com',
              QDRANT_COLLECTION: 'test-collection',
              RATE_LIMIT_MEMORY_CACHE_TTL: value.toString(),
            } as Env

            const result = validateEnv(env)
            expect(result.ok).toBe(false)
            expect(result.errors).toContainEqual({
              type: 'error',
              field: 'RATE_LIMIT_MEMORY_CACHE_TTL',
              message: 'must be an integer between 1 and 86400000'
            })
          }
        })
      })
    })

    describe('Edge cases', () => {
      it('should handle empty string values as undefined', () => {
        const env = {
          OPENAI_API_KEY: 'sk-test',
          QDRANT_API_KEY: 'qdrant-key',
          TELEGRAM_BOT_TOKEN: 'bot-token',
          QDRANT_URL: 'https://qdrant.example.com',
          QDRANT_COLLECTION: 'test-collection',
          RATE_LIMIT_MAX: '', // empty string
          BOARD_COLLECTION_TOP_K: '', // empty string
        } as Env

        const result = validateEnv(env)
        expect(result.ok).toBe(true) // empty strings are treated as undefined and ignored
      })

      it('should handle null values as undefined', () => {
        const env = {
          OPENAI_API_KEY: 'sk-test',
          QDRANT_API_KEY: 'qdrant-key',
          TELEGRAM_BOT_TOKEN: 'bot-token',
          QDRANT_URL: 'https://qdrant.example.com',
          QDRANT_COLLECTION: 'test-collection',
          RATE_LIMIT_MAX: null, // null
          BOARD_COLLECTION_TOP_K: null, // null
        } as any

        const result = validateEnv(env)
        expect(result.ok).toBe(true) // null values are treated as undefined and ignored
      })

      it('should handle non-numeric string values', () => {
        const env = {
          OPENAI_API_KEY: 'sk-test',
          QDRANT_API_KEY: 'qdrant-key',
          TELEGRAM_BOT_TOKEN: 'bot-token',
          QDRANT_URL: 'https://qdrant.example.com',
          QDRANT_COLLECTION: 'test-collection',
          RATE_LIMIT_MAX: 'not-a-number',
          BOARD_COLLECTION_TOP_K: 'invalid',
        } as Env

        const result = validateEnv(env)
        expect(result.ok).toBe(false)
        expect(result.errors).toHaveLength(2)
        expect(result.errors.map(e => e.field)).toContain('RATE_LIMIT_MAX')
        expect(result.errors.map(e => e.field)).toContain('BOARD_COLLECTION_TOP_K')
      })

      it('should handle floating point numbers by truncating to integer', () => {
        // Note: parseInt truncates floating point numbers to integers
        // '5.5' becomes 5, '3.14' becomes 3 - both are valid values
        const env = {
          OPENAI_API_KEY: 'sk-test',
          QDRANT_API_KEY: 'qdrant-key',
          TELEGRAM_BOT_TOKEN: 'bot-token',
          QDRANT_URL: 'https://qdrant.example.com',
          QDRANT_COLLECTION: 'test-collection',
          RATE_LIMIT_MAX: '5.5', // becomes 5 (valid)
          BOARD_COLLECTION_TOP_K: '3.14', // becomes 3 (valid)
        } as Env

        const result = validateEnv(env)
        expect(result.ok).toBe(true) // parseInt truncates to valid integers
      })

      it('should reject floating point numbers that truncate to invalid values', () => {
        const env = {
          OPENAI_API_KEY: 'sk-test',
          QDRANT_API_KEY: 'qdrant-key',
          TELEGRAM_BOT_TOKEN: 'bot-token',
          QDRANT_URL: 'https://qdrant.example.com',
          QDRANT_COLLECTION: 'test-collection',
          RATE_LIMIT_MAX: '1500.75', // becomes 1500 (invalid - too high)
          BOARD_COLLECTION_TOP_K: '100.99', // becomes 100 (invalid - too high)
        } as Env

        const result = validateEnv(env)
        expect(result.ok).toBe(false)
        expect(result.errors).toHaveLength(2)
        expect(result.errors.map(e => e.field)).toContain('RATE_LIMIT_MAX')
        expect(result.errors.map(e => e.field)).toContain('BOARD_COLLECTION_TOP_K')
      })

      it('should accumulate multiple validation errors', () => {
        const env = {
          // Missing required fields
          QDRANT_API_KEY: 'qdrant-key',
          // Invalid numeric values
          RATE_LIMIT_MAX: '2000', // too high
          BOARD_COLLECTION_TOP_K: '100', // too high
          RATE_LIMIT_WINDOW_MS: '50', // too low
        } as any

        const result = validateEnv(env)
        expect(result.ok).toBe(false)
        expect(result.errors.length).toBeGreaterThanOrEqual(6) // multiple errors
        expect(result.warnings).toHaveLength(1) // missing webhook secret
      })
    })
  })

  describe('assertValidEnv', () => {
    it('should not throw with valid environment', () => {
      const env: Env = {
        OPENAI_API_KEY: 'sk-test',
        QDRANT_API_KEY: 'qdrant-key',
        TELEGRAM_BOT_TOKEN: 'bot-token',
        WEBHOOK_SECRET_TOKEN: 'webhook-secret',
        QDRANT_URL: 'https://qdrant.example.com',
        QDRANT_COLLECTION: 'test-collection',
      }

      expect(() => assertValidEnv(env)).not.toThrow()
    })

    it('should throw with invalid environment', () => {
      const env = {
        QDRANT_API_KEY: 'qdrant-key',
        RATE_LIMIT_MAX: '2000', // invalid
      } as any

      expect(() => assertValidEnv(env)).toThrow('Invalid environment configuration')
    })

    it('should include all error details in thrown message', () => {
      const env = {} as Env

      expect(() => assertValidEnv(env)).toThrow(/OPENAI_API_KEY/)
      expect(() => assertValidEnv(env)).toThrow(/QDRANT_API_KEY/)
      expect(() => assertValidEnv(env)).toThrow(/TELEGRAM_BOT_TOKEN/)
    })

    it('should not throw on warnings only', () => {
      const env = {
        OPENAI_API_KEY: 'sk-test',
        QDRANT_API_KEY: 'qdrant-key',
        TELEGRAM_BOT_TOKEN: 'bot-token',
        QDRANT_URL: 'https://qdrant.example.com',
        QDRANT_COLLECTION: 'test-collection',
        // Missing WEBHOOK_SECRET_TOKEN (warning only)
      } as Env

      expect(() => assertValidEnv(env)).not.toThrow()
    })
  })

  describe('Type safety', () => {
    it('should work with actual Env type', () => {
      // This test ensures the validation works with the actual Env type from types.ts
      const env: Env = {
        OPENAI_API_KEY: 'sk-test',
        QDRANT_API_KEY: 'qdrant-key', 
        TELEGRAM_BOT_TOKEN: 'bot-token',
        WEBHOOK_SECRET_TOKEN: 'webhook-secret',
      }

      // Add extra properties that might exist at runtime
      const extendedEnv = {
        ...env,
        QDRANT_URL: 'https://qdrant.example.com',
        QDRANT_COLLECTION: 'test-collection',
        RATE_LIMIT_MAX: '5',
        BOARD_COLLECTION_TOP_K: '10'
      } as Env

      const result = validateEnv(extendedEnv)
      expect(result.ok).toBe(true)
    })
  })
})