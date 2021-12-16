/* IMPORTANT
 * This snapshot file is auto-generated, but designed for humans.
 * It should be checked into source control and tracked carefully.
 * Re-generate by setting TAP_SNAPSHOT=1 and running tests.
 * Make sure to inspect the output below.  Do not ignore changes!
 */
'use strict'
exports['test/federation.js TAP buildFederationSchema function adds stub types > must match snapshot 1'] = `
directive @external on FIELD_DEFINITION

directive @requires(fields: _FieldSet!) on FIELD_DEFINITION

directive @provides(fields: _FieldSet!) on FIELD_DEFINITION

directive @key(fields: _FieldSet!) on OBJECT | INTERFACE

directive @extends on OBJECT | INTERFACE

directive @customdir on FIELD_DEFINITION

scalar _Any

scalar _FieldSet

type _Service {
  sdl: String
}

type Query {
  me: User
  _entities(representations: [_Any!]!): [_Entity]!
  _service: _Service!
}

type Product {
  sku: String
}

type User {
  id: ID!
  name: String
  username: String
}

union _Entity = Product | User
`
