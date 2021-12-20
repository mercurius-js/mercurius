'use strict'

const { parse } = require('graphql')
const getQueryResult = require('../../lib/gateway/get-query-result')
const { test } = require('tap')

const getQueryWithCount = (count) => `
query EntitiesQuery($representations: [_Any!]!) {
  _entities(representations: $representations) {
    __typename
    ... on User {
      topPosts(count: ${count}) {
        pid
        __typename
        pid
      }
    }
  }
}
`

const createEntity = (pid) => ({
  __typename: 'User',
  topPosts: {
    pid,
    __typename: 'Post'
  }
})

const createNotBatchedResponse = (...entities) => ({
  json: {
    data: {
      _entities: [...entities]
    }
  }
})

const createBatchedResponse = (...entities) => ({
  json: [
    {
      data: {
        _entities: [...entities]
      }
    },
    {
      data: {
        _entities: [...entities]
      }
    }
  ]
})

test('it works with a basic example', async (t) => {
  const entity1 = createEntity('p1')
  const entity2 = createEntity('p2')
  const result = await getQueryResult({
    context: {
      preGatewayExecution: null,
      reply: {
        request: {
          headers: {}
        }
      }
    },

    queries: [
      {
        document: parse(getQueryWithCount(1)),
        query: getQueryWithCount(1),
        variables: {
          representations: [
            {
              __typename: 'User',
              id: 'u1'
            }
          ]
        }
      }
    ],
    serviceDefinition: {
      sendRequest: async () => createNotBatchedResponse(entity1, entity2)
    }
  })

  t.same(result[0].data._entities[0], entity1)
  t.same(result[0].data._entities[1], entity2)
})

test('it works with a basic example and batched queries', async (t) => {
  const entity1 = createEntity('p3')
  const entity2 = createEntity('p4')
  const result = await getQueryResult({
    context: {
      preGatewayExecution: null,
      reply: {
        request: {
          headers: {}
        }
      }
    },
    queries: [
      {
        document: parse(getQueryWithCount(1)),
        query: getQueryWithCount(1),
        variables: {
          representations: [
            {
              __typename: 'User',
              id: 'u1'
            }
          ]
        }
      },
      {
        document: parse(getQueryWithCount(2)),
        query: getQueryWithCount(2),
        variables: {
          representations: [
            {
              __typename: 'User',
              id: 'u1'
            }
          ]
        }
      }
    ],
    serviceDefinition: {
      allowBatchedQueries: true,
      sendRequest: async () => createBatchedResponse(entity1, entity2)
    }
  })

  t.same(result[0].data._entities[0], entity1)
  t.same(result[0].data._entities[1], entity2)
  t.same(result[1].data._entities[0], entity1)
  t.same(result[1].data._entities[1], entity2)
})
