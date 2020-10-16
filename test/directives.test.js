'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')
const { makeExecutableSchema } = require('graphql-tools')
const { constraintDirective, constraintDirectiveTypeDefs } = require('graphql-constraint-directive')

test('directives with makeExecutableSchema', async (t) => {
  const app = Fastify()

  const todos = []
  const typeDefs = `
  type AddTodoResponse {
    todos: [String]
  }
  type Query {
    todos: [String]
  }
  type Mutation {
    addTodo (input: TodoInput): AddTodoResponse
  }
  input TodoInput {
    todo: String! @constraint(minLength: 3, maxLength: 20)
  }
`

  const resolvers = {
    Query: {
      todos: async () => todos
    },
    Mutation: {
      addTodo: async (_, { input: { todo } }) => {
        todos.push(todo)
        return { todos }
      }
    }
  }

  app.register(GQL, {
    graphiql: true,
    schema: makeExecutableSchema({
      typeDefs: [constraintDirectiveTypeDefs, typeDefs],
      schemaTransforms: [constraintDirective()],
      resolvers
    })
  })

  const query = 'mutation { addTodo(input: { todo: "" }) { todos } }'

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 400)
  t.deepEqual(JSON.parse(res.body), {
    data: null,
    errors: [{
      message: 'Expected value of type "todo_String_NotNull_minLength_3_maxLength_20!", found ""; Must be at least 3 characters in length',
      locations: [{ line: 1, column: 35 }]
    }]
  })
})

test('directives with extendSchema', async (t) => {
  const app = Fastify()

  const todos = []
  const typeDefs = `
  type AddTodoResponse {
    todos: [String]
  }
  extend type Query {
    todos: [String]
  }
  extend type Mutation {
    addTodo (input: TodoInput): AddTodoResponse
  }
  input TodoInput {
    todo: String! @constraint(minLength: 3, maxLength: 20)
  }
`

  const resolvers = {
    Query: {
      todos: async () => todos
    },
    Mutation: {
      addTodo: async (_, { input: { todo } }) => {
        todos.push(todo)
        return { todos }
      }
    }
  }

  await app.register(GQL, { defineMutation: true })

  app.graphql.extendSchema(constraintDirectiveTypeDefs)
  app.graphql.extendSchema(typeDefs)
  app.graphql.defineResolvers(resolvers)
  app.graphql.schema = constraintDirective()(app.graphql.schema)

  const query = 'mutation { addTodo(input: { todo: "" }) { todos } }'

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 400)
  t.deepEqual(JSON.parse(res.body), {
    data: null,
    errors: [{
      message: 'Expected value of type "todo_String_NotNull_minLength_3_maxLength_20!", found ""; Must be at least 3 characters in length',
      locations: [{ line: 1, column: 35 }]
    }]
  })
})

test('directives with transformSchema', async (t) => {
  const app = Fastify()

  const todos = []
  const typeDefs = `
  type AddTodoResponse {
    todos: [String]
  }
  extend type Query {
    todos: [String]
  }
  extend type Mutation {
    addTodo (input: TodoInput): AddTodoResponse
  }
  input TodoInput {
    todo: String! @constraint(minLength: 3, maxLength: 20)
  }
`

  const resolvers = {
    Query: {
      todos: async () => todos
    },
    Mutation: {
      addTodo: async (_, { input: { todo } }) => {
        todos.push(todo)
        return { todos }
      }
    }
  }

  await app.register(GQL, { defineMutation: true })

  app.graphql.extendSchema(constraintDirectiveTypeDefs)
  app.graphql.extendSchema(typeDefs)
  app.graphql.defineResolvers(resolvers)
  app.graphql.transformSchema(constraintDirective())

  const query = 'mutation { addTodo(input: { todo: "" }) { todos } }'

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 400)
  t.deepEqual(JSON.parse(res.body), {
    data: null,
    errors: [{
      message: 'Expected value of type "todo_String_NotNull_minLength_3_maxLength_20!", found ""; Must be at least 3 characters in length',
      locations: [{ line: 1, column: 35 }]
    }]
  })
})

test('directives with options', async (t) => {
  const app = Fastify()

  const todos = []
  const typeDefs = `
  type AddTodoResponse {
    todos: [String]
  }
  type Query {
    todos: [String]
  }
  type Mutation {
    addTodo (input: TodoInput): AddTodoResponse
  }
  input TodoInput {
    todo: String! @constraint(minLength: 3, maxLength: 20)
  }
`

  const resolvers = {
    Query: {
      todos: async () => todos
    },
    Mutation: {
      addTodo: async (_, { input: { todo } }) => {
        todos.push(todo)
        return { todos }
      }
    }
  }

  app.register(GQL, {
    graphiql: true,
    schema: [constraintDirectiveTypeDefs, typeDefs],
    schemaTransforms: [constraintDirective()],
    resolvers
  })

  const query = 'mutation { addTodo(input: { todo: "" }) { todos } }'

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 400)
  t.deepEqual(JSON.parse(res.body), {
    data: null,
    errors: [{
      message: 'Expected value of type "todo_String_NotNull_minLength_3_maxLength_20!", found ""; Must be at least 3 characters in length',
      locations: [{ line: 1, column: 35 }]
    }]
  })
})
