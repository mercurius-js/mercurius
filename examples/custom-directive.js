'use strict'

const Fastify = require('fastify')
const mercurius = require('..')
const { makeExecutableSchema } = require('@graphql-tools/schema')
const { mapSchema, getDirective, MapperKind } = require('@graphql-tools/utils')

const app = Fastify()

const resolvers = {
  Query: {
    document: async (_, _obj, _ctx) => {
      return {
        id: '1',
        text: 'Proin password rutrum pulvinar lectus sed placerat.'
      }
    }
  }
}

// Define the executable schema
const schema = makeExecutableSchema({
  typeDefs: `
    # Define the directive schema
    directive @redact(find: String) on FIELD_DEFINITION
    
    type Document {
      id: String!
      text: String! @redact(find: "password")
    }

    type Query {
      document: Document 
    }
    `,
  resolvers
})

// Define directive schema resolver
const redactionSchemaTransformer = (schema) => mapSchema(schema, {
  // When parsing the schema we find a FIELD
  [MapperKind.OBJECT_FIELD]: fieldConfig => {
    // Get the directive information
    const redactDirective = getDirective(schema, fieldConfig, 'redact')?.[0]
    if (redactDirective) {
      const { find } = redactDirective
      fieldConfig.resolve = async (obj, _args, ctx, info) => {
        const value = obj[info.fieldName]
        if (!ctx.redaction) {
          return document
        }
        return value.replace(find, '**********')
      }
    }
  }
})

// Register mercurius and run it
app.register(mercurius, {
  schema: redactionSchemaTransformer(schema),
  context: (request, reply) => {
    return {
      redaction: true
    }
  },
  graphiql: true
})

app.listen({ port: 3000 })
