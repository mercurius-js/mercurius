'use strict'

const { execute } = require('graphql')
const { experimentalExecuteIncrementally } = require('graphql/execution')

function hasDirective (directiveName, node) {
  if (!node.directives || node.directives.length < 1) {
    return false
  }
  for (let i = 0; i < node.directives.length; i++) {
    if (node.directives[i].name.value === directiveName) {
      return true
    }
  }
}

function hasExtensionDirective (node) {
  if (!node.directives || node.directives.length < 1) {
    return false
  }
  for (let i = 0; i < node.directives.length; i++) {
    const directive = node.directives[i].name.value
    if (directive === 'extends' || directive === 'requires') {
      return true
    }
  }
}

// istanbul ignore next
function executeGraphql (isDeferEnabled, args) {
  if (isDeferEnabled) {
    return experimentalExecuteIncrementally(args)
  }

  return execute(args)
}

const MEDIA_TYPES = {
  MULTIPART_MIXED_NO_DEFER_SPEC: 'multipart/mixed',
  MULTIPART_MIXED_EXPERIMENTAL: 'multipart/mixed; deferSpec=20220824'
}

module.exports = {
  hasDirective,
  hasExtensionDirective,
  executeGraphql,
  MEDIA_TYPES
}
