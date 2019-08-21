/* IMPORTANT
 * This snapshot file is auto-generated, but designed for humans.
 * It should be checked into source control and tracked carefully.
 * Re-generate by setting TAP_SNAPSHOT=1 and running tests.
 * Make sure to inspect the output below.  Do not ignore changes!
 */
'use strict'
exports['test/routes.js TAP GET return 500 on resolver error > must match snapshot 1'] = `
{
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
  "errors": [
    {
      "message": "Syntax Error: Expected Name, found <EOF>",
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

exports['test/routes.js TAP POST return 500 on resolver error > must match snapshot 1'] = `
{
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

exports['test/routes.js TAP mutation with GET errors > must match snapshot 1'] = `
{
  "errors": [
    {
      "message": "Operation cannot be perfomed via a GET request"
    }
  ]
}
`
