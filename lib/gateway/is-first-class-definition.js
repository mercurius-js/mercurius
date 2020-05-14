function isFirstClassDefinition (definition) {
  return ['Query', 'Mutation', 'Subscription'].includes(definition.name.value)
}

module.exports = {
  isFirstClassDefinition
}
