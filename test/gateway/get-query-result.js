'use strict'

const getQueryResult = require('../../lib/gateway/get-query-result')
const { test } = require('tap')

const query1 = `
query EntitiesQuery($representations: [_Any!]!) {
  _entities(representations: $representations) {
    __typename
    ... on User {
      topPosts(count: 1) {
        pid
        __typename
        pid
      }
    }
  }
}

`
const query2 = `
query EntitiesQuery($representations: [_Any!]!) {
  _entities(representations: $representations) {
    __typename
    ... on User {
      topPosts(count: 2) {
        pid
        __typename
        pid
      }
    }
  }
}
`

test('it works with a basic example', async (t) => {
  const result = await getQueryResult({
    queries: [
      {
        context: {
          preGatewayExecution: null
        },
        query: query1,
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
      sendRequest: async () => ({
        json: {
          data: {
            _entities: [
              {
                __typename: 'User',
                topPosts: {
                  pid: 'p1',
                  __typename: 'Post'
                }
              }
            ]
          }
        }
      })
    }
  })

  t.same(result[0].data._entities[0], {
    __typename: 'User',
    topPosts: {
      pid: 'p1',
      __typename: 'Post'
    }
  })
})

test('it works with a basic example and batched queries', async (t) => {
  const result = await getQueryResult({
    queries: [
      {
        context: {
          preGatewayExecution: null
        },
        query: query1,
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
        context: {
          preGatewayExecution: null
        },
        query: query2,
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
      sendRequest: async () => ({
        json: [
          {
            data: {
              _entities: [
                {
                  __typename: 'User',
                  topPosts: [{ pid: 'p1', __typename: 'Post' }]
                }
              ]
            }
          },
          {
            data: {
              _entities: [
                {
                  __typename: 'User',
                  topPosts: [
                    { pid: 'p1', __typename: 'Post' },
                    { pid: 'p3', __typename: 'Post' }
                  ]
                }
              ]
            }
          }
        ]
      })
    }
  })

  t.same(result, [
    {
      data: {
        _entities: [
          {
            __typename: 'User',
            topPosts: [
              {
                pid: 'p1',
                __typename: 'Post'
              }
            ]
          }
        ]
      },
      json: {
        data: {
          _entities: [
            {
              __typename: 'User',
              topPosts: [
                {
                  pid: 'p1',
                  __typename: 'Post'
                }
              ]
            }
          ]
        }
      }
    },
    {
      data: {
        _entities: [
          {
            __typename: 'User',
            topPosts: [
              {
                pid: 'p1',
                __typename: 'Post'
              },
              {
                pid: 'p3',
                __typename: 'Post'
              }
            ]
          }
        ]
      },
      json: {
        data: {
          _entities: [
            {
              __typename: 'User',
              topPosts: [
                {
                  pid: 'p1',
                  __typename: 'Post'
                },
                {
                  pid: 'p3',
                  __typename: 'Post'
                }
              ]
            }
          ]
        }
      }
    }
  ])
})
