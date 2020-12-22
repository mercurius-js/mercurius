/* IMPORTANT
 * This snapshot file is auto-generated, but designed for humans.
 * It should be checked into source control and tracked carefully.
 * Re-generate by setting TAP_SNAPSHOT=1 and running tests.
 * Make sure to inspect the output below.  Do not ignore changes!
 */
'use strict'
exports['test/routes.js TAP GET return 200 on resolver error > must match snapshot 1'] = `
{
  "data": {
    "add": null
  },
  "errors": [
    {
      "message": "this is a dummy error",
      "locations": [
        {
          "line": 1,
          "column": 2
        }
      ],
      "path": [
        "add"
      ]
    }
  ]
}
`

exports['test/routes.js TAP POST return 200 on resolver error > must match snapshot 1'] = `
{
  "data": {
    "add": null
  },
  "errors": [
    {
      "message": "this is a dummy error",
      "locations": [
        {
          "line": 1,
          "column": 2
        }
      ],
      "path": [
        "add"
      ]
    }
  ]
}
`

exports['test/routes.js TAP POST return 400 on error > must match snapshot 1'] = `
{
  "data": null,
  "errors": [
    {
      "message": "Syntax Error: Expected Name, found <EOF>.",
      "locations": [
        {
          "line": 1,
          "column": 18
        }
      ]
    }
  ]
}
`

exports['test/routes.js TAP if ide is graphiql, serve config.js with the correct endpoint > must match snapshot 1'] = `
window.GRAPHQL_ENDPOINT = '/app/graphql'
`

exports['test/routes.js TAP if ide is playground, and playgroundHeaders is a method, serve init.js with playground headers as iife > must match snapshot 1'] = `
window.addEventListener('load', function(event) {
  const headers = (function playgroundHeaders (window) {
      return {
        authorization: \`bearer \${window.localStorage.getItem('token')}\`
      }
    })(window);

  GraphQLPlayground.init(document.getElementById('root'), {
    subscriptionEndpoint: '/graphql',
    endpoint: '/graphql',
    settings: undefined,
    headers: headers
  });
});
`

exports['test/routes.js TAP if ide is playground, and playgroundHeaders is a named function, serve init.js with playground headers as iife > must match snapshot 1'] = `
window.addEventListener('load', function(event) {
  const headers = (function headers (window) {
      return {
        authorization: \`bearer \${window.localStorage.getItem('token')}\`
      }
    })(window);

  GraphQLPlayground.init(document.getElementById('root'), {
    subscriptionEndpoint: '/graphql',
    endpoint: '/graphql',
    settings: undefined,
    headers: headers
  });
});
`

exports['test/routes.js TAP if ide is playground, and playgroundHeaders is an anonymous function, serve init.js with playground headers as iife > must match snapshot 1'] = `
window.addEventListener('load', function(event) {
  const headers = (function (window) {
      return {
        authorization: \`bearer \${window.localStorage.getItem('token')}\`
      }
    })(window);

  GraphQLPlayground.init(document.getElementById('root'), {
    subscriptionEndpoint: '/graphql',
    endpoint: '/graphql',
    settings: undefined,
    headers: headers
  });
});
`

exports['test/routes.js TAP if ide is playground, and playgroundHeaders is an arrow function, serve init.js with playground headers as iife > must match snapshot 1'] = `
window.addEventListener('load', function(event) {
  const headers = (window => {
      return {
        authorization: \`bearer \${window.localStorage.getItem('token')}\`
      }
    })(window);

  GraphQLPlayground.init(document.getElementById('root'), {
    subscriptionEndpoint: '/graphql',
    endpoint: '/graphql',
    settings: undefined,
    headers: headers
  });
});
`

exports['test/routes.js TAP if ide is playground, and playgroundHeaders is an object, serve init.js with playground headers options > must match snapshot 1'] = `
window.addEventListener('load', function(event) {
  const headers = {"authorization":"bearer token"}

  GraphQLPlayground.init(document.getElementById('root'), {
    subscriptionEndpoint: '/graphql',
    endpoint: '/graphql',
    settings: undefined,
    headers: headers
  });
});
`

exports['test/routes.js TAP if ide is playground, and playgroundSettings is set, serve init.js with playground editor options > must match snapshot 1'] = `
window.addEventListener('load', function(event) {
  const headers = undefined

  GraphQLPlayground.init(document.getElementById('root'), {
    subscriptionEndpoint: '/graphql',
    endpoint: '/graphql',
    settings: {"editor.theme":"light","editor.fontSize":17},
    headers: headers
  });
});
`

exports['test/routes.js TAP if ide is playground, serve init.js with the correct endpoint > must match snapshot 1'] = `
window.addEventListener('load', function(event) {
  const headers = undefined

  GraphQLPlayground.init(document.getElementById('root'), {
    subscriptionEndpoint: '/app/graphql',
    endpoint: '/app/graphql',
    settings: undefined,
    headers: headers
  });
});
`

exports['test/routes.js TAP mutation with GET errors > must match snapshot 1'] = `
{
  "data": null,
  "errors": [
    {
      "message": "Operation cannot be performed via a GET request"
    }
  ]
}
`

exports['test/routes.js TAP server should return 200 on graphql errors (if field can be null) > must match snapshot 1'] = `
{
  "data": {
    "hello": null
  },
  "errors": [
    {
      "message": "Simple error",
      "locations": [
        {
          "line": 3,
          "column": 7
        }
      ],
      "path": [
        "hello"
      ]
    }
  ]
}
`

exports['test/routes.js TAP server should return 500 on graphql errors (if field can not be null) > must match snapshot 1'] = `
{
  "errors": [
    {
      "message": "Simple error",
      "locations": [
        {
          "line": 3,
          "column": 7
        }
      ],
      "path": [
        "hello"
      ]
    }
  ],
  "data": null
}
`
