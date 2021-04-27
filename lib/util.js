'use strict'

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

module.exports = {
  hasDirective,
  hasExtensionDirective
}
