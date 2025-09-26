'use strict'

const { MER_ERR_GQL_CSRF_PREVENTION } = require('./errors')

const CSRF_ERROR_MESSAGE = 'This operation has been blocked as a potential Cross-Site Request Forgery (CSRF).'
const defaultCSRFConfig = {
  allowedContentTypes: ['application/json', 'application/graphql'],
  requiredHeaders: ['x-mercurius-operation-name', 'mercurius-require-preflight']
}

/**
 * Check if a Content-Type header indicates a non-simple request
 * @param {string} contentType - The Content-Type header value
 * @param {string[]} allowedContentTypes - The allowed content types
 * @returns {boolean} - True if the content type makes the request non-simple
 */
function isValidContentType (contentType, allowedContentTypes) {
  if (!contentType) return false

  const index = contentType.indexOf(';')
  if (index === -1) {
    return allowedContentTypes.includes(contentType)
  }

  // Extract the main content type (ignore charset and other parameters)
  const type = contentType.substring(0, index).trim().toLowerCase()
  return allowedContentTypes.includes(type)
}

/**
 * Check if any of the required headers are present - note both are already lowercased
 * @param {Object} headers - Request headers
 * @param {string[]} requiredHeaders - Array of required header names
 * @returns {boolean} - True if at least one required header is present
 */
function hasRequiredHeader (headers, requiredHeaders) {
  for (let i = 0; i < requiredHeaders.length; i++) {
    if (Object.hasOwn(headers, requiredHeaders[i])) {
      return true
    }
  }
}

/**
 * Validate CSRF prevention configuration
 * @param {Object} config - CSRF configuration
 * @returns {Object} - Normalized configuration
 */
function normalizeCSRFConfig (config) {
  if (config === true) {
    return defaultCSRFConfig
  }

  if (!config) {
    return undefined
  }

  const normalized = {}

  let multipart = false
  if (config.requiredHeaders) {
    if (!Array.isArray(config.requiredHeaders)) {
      throw new Error('csrfPrevention.requiredHeaders must be an array')
    }
    normalized.requiredHeaders = config.requiredHeaders.map(h => h.toLowerCase())
  } else {
    normalized.requiredHeaders = defaultCSRFConfig.requiredHeaders
  }

  if (config.allowedContentTypes) {
    if (!Array.isArray(config.allowedContentTypes)) {
      throw new Error('csrfPrevention.allowedContentTypes must be an array')
    }
    normalized.allowedContentTypes = config.allowedContentTypes.map(h => {
      if (h === 'multipart/form-data') {
        multipart = true
      }
      return h.toLowerCase()
    })
  } else {
    normalized.allowedContentTypes = defaultCSRFConfig.allowedContentTypes
  }

  multipart && (normalized.multipart = true)

  return normalized
}

/**
 * Perform CSRF prevention check
 * @param {Object} request - Fastify request object
 * @param {Object} config - CSRF configuration
 * @throws {MER_ERR_GQL_CSRF_PREVENTION} - If CSRF check fails
 */
function checkCSRFPrevention (request, config) {
  // Check 1: Content-Type header indicates non-simple request
  if (isValidContentType(request.headers['content-type'], config.allowedContentTypes)) {
    if (config.multipart) {
      if (hasRequiredHeader(request.headers, config.requiredHeaders)) {
        return // Request is safe
      } else {
        const err = new MER_ERR_GQL_CSRF_PREVENTION()
        err.message = CSRF_ERROR_MESSAGE
        throw err
      }
    }

    return // Request is safe
  }

  // Check 2: Required headers are present
  if (hasRequiredHeader(request.headers, config.requiredHeaders)) {
    return // Request is safe
  }

  // Request failed CSRF prevention checks
  const err = new MER_ERR_GQL_CSRF_PREVENTION()
  err.message = CSRF_ERROR_MESSAGE
  throw err
}

module.exports = {
  normalizeCSRFConfig,
  checkCSRFPrevention,
  isValidContentType,
  hasRequiredHeader,
  CSRF_ERROR_MESSAGE
}
