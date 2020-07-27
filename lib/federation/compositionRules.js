'use strict'

const { specifiedSDLRules } = require('graphql/validation/specifiedRules')
const { UniqueDirectivesPerLocationRule } = require('graphql')

// this rules overwrite the built-in rules for federation schema
// here we only remove the UniqueDirectivesPerLocationRule from the standard rules
// to fix https://github.com/mcollina/fastify-gql/issues/184
// this is also the point were we may need to add federation-specific rules
module.exports = specifiedSDLRules.filter(rule => rule !== UniqueDirectivesPerLocationRule)
