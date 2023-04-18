'use strict'

const Fastify = require('fastify')
const mercurius = require('..')
const { makeExecutableSchema } = require('@graphql-tools/schema')
const { mapSchema, getDirective, MapperKind } = require('@graphql-tools/utils')

const app = Fastify()

const resolvers = {
  Query: {
    document: async (_, obj, ctx) => {
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
    directive @censorship(find: String) on FIELD_DEFINITION
    
    type Document {
      id: String!
      text: String! 
    }

    type Query {
      document: Document @censorship(find: "password")
    }
    `,
  resolvers
})

// Define directive schema resolver
const censorshipSchemaTransformer = (schema) => mapSchema(schema, {
  // When parsing the schema we find a FIELD
  [MapperKind.FIELD]: fieldConfig => {
    // Get the directive information
    const censorshipDirective = getDirective(schema, fieldConfig, 'censorship')?.[0]
    if (censorshipDirective) {
      // Get the resolver of the field
      const innerResolver = fieldConfig.resolve
      // Extract the find property from the directive
      const { find } = censorshipDirective
      // Define a new resolver for the field
      fieldConfig.resolve = async (_obj, args, ctx, info) => {
        // Run the original resolver to get the result
        const document = await innerResolver(_obj, args, ctx, info)
        // Apply censorship only if context censored is true
        if (!ctx.censored) {
          return document
        }
        return { ...document, text: document.text.replace(find, '**********') }
      }
    }
  }
})

// Register mercurius and run it
app.register(mercurius, {
  schema: censorshipSchemaTransformer(schema),
  context: (request, reply) => {
    return {
      censored: false
    }
  },
  graphiql: true
})

app.listen({ port: 3000 })
