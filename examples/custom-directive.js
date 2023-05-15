'use strict'

const Fastify = require('fastify')
const mercurius = require('..')
const { makeExecutableSchema } = require('@graphql-tools/schema')
const { mapSchema, getDirective, MapperKind } = require('@graphql-tools/utils')

const app = Fastify()

const resolvers = {
  Query: {
    documents: async (_, _obj, _ctx) => {
      return [{
        excerpt: 'Proin info@mercurius.dev rutrum pulvinar lectus sed placerat.',
        text: 'Proin 33 222-33355 rutrum pulvinar lectus sed placerat.'
      }]
    }
  }
}

// Define the executable schema
const schema = makeExecutableSchema({
  typeDefs: `
    # Define the directive schema
    directive @redact(find: String) on FIELD_DEFINITION
    
    type Document {
      excerpt: String! @redact(find: "email")
      text: String! @redact(find: "phone")
    }

    type Query {
      documents: [Document] 
    }
    `,
  resolvers
})

const PHONE_REGEXP = /(?:\+?\d{2}[ -]?\d{3}[ -]?\d{5}|\d{4})/g
const EMAIL_REGEXP = /([^\s@])+@[^\s@]+\.[^\s@]+/g

const redactionSchemaTransformer = (schema) => mapSchema(schema, {
  [MapperKind.OBJECT_FIELD]: fieldConfig => {
    const redactDirective = getDirective(schema, fieldConfig, 'redact')?.[0]

    if (redactDirective) {
      const { find } = redactDirective

      fieldConfig.resolve = async (obj, _args, ctx, info) => {
        const value = obj[info.fieldName]

        if (!ctx.redact) {
          return document
        }

        switch (find) {
          case 'email':
            return value.replace(EMAIL_REGEXP, '****@*****.***')
          case 'phone':
            return value.replace(PHONE_REGEXP, m => '*'.repeat(m.length))
          default:
            return value
        }
      }
    }
  }
})

// Register mercurius and run it
app.register(mercurius, {
  schema: redactionSchemaTransformer(schema),
  context: (request, reply) => {
    return {
      redact: true
    }
  },
  graphiql: true
})

app.listen({ port: 3000 })
