/* IMPORTANT
 * This snapshot file is auto-generated, but designed for humans.
 * It should be checked into source control and tracked carefully.
 * Re-generate by setting TAP_SNAPSHOT=1 and running tests.
 * Make sure to inspect the output below.  Do not ignore changes!
 */
'use strict'
exports['test/errors.js TAP POST query which throws, with JIT enabled, twice > must match snapshot 1'] = `
{
  "data": {
    "bad": null
  },
  "errors": [
    {
      "message": "Bad Resolver",
      "locations": [
        {
          "line": 3,
          "column": 15
        }
      ],
      "path": [
        "bad"
      ]
    }
  ]
}
`

exports['test/errors.js TAP POST query which throws, with JIT enabled, twice > must match snapshot 2'] = `
{
  "data": {
    "bad": null
  },
  "errors": [
    {
      "message": "Int cannot represent non-integer value: [function bad]",
      "locations": [
        {
          "line": 3,
          "column": 15
        }
      ],
      "path": [
        "bad"
      ]
    }
  ]
}
`

exports['test/errors.js TAP app.graphql which throws, with JIT enabled, twice > must match snapshot 1'] = `
{"errors":[{"message":"Bad Resolver","locations":[{"line":3,"column":9}],"path":["bad"]}],"data":{"bad":null}}
`

exports['test/errors.js TAP app.graphql which throws, with JIT enabled, twice > must match snapshot 2'] = `
{"data":{"bad":null},"errors":[{"message":"Int cannot represent non-integer value: [function bad]","locations":[{"line":3,"column":9}],"path":["bad"]}]}
`
