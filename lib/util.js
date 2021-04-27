'use strict'

function hasDirective (directiveName, node) {
  if (!node.directives || node.directives.length < 1) {
    return false
  }
  return node.directives.some(directive => directive.name.value === directiveName)
}

function hasExtensionDirective (node) {
  if (!node.directives || node.directives.length < 1) {
    return false
  }
  return node.directives.some(directive =>
    directive.name.value === 'extends' || directive.name.value === 'requires')
}

module.exports = {
  hasDirective,
  hasExtensionDirective
}
