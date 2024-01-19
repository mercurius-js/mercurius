# mercurius

- [HTTP Status Codes](#http-status-codes)
  - [Default behaviour](#default-behaviour)
    - [Response with data](#response-with-data)
    - [Invalid input document](#invalid-input-document)
    - [Multiple errors](#multiple-errors)
    - [Single error with `statusCode` property](#single-error-with-statuscode-property)
    - [Single error with no `statusCode` property](#single-error-with-no-statuscode-property)
  - [Custom behaviour](#custom-behaviour)
    - [`200 OK` on all requests](#200-ok-on-all-requests)

Mercurius exhibits the following behaviour when serving GraphQL over HTTP.

## HTTP Status Codes

### Default behaviour

Mercurius has the following default behaviour for HTTP Status Codes.

#### Response with data

When a GraphQL response contains `data` that is defined, the HTTP Status Code is `200 OK`.

- **HTTP Status Code**: `200 OK`
- **Data**: `!== null`
- **Errors**: `N/A`

#### Invalid input document

When a GraphQL input document is invalid and fails GraphQL validation, the HTTP Status Code is `400 Bad Request`.

- **HTTP Status Code**: `400 Bad Request`
- **Data**: `null`
- **Errors**: `MER_ERR_GQL_VALIDATION`

#### Response with errors

When a GraphQL response contains errors, the HTTP Status Code is `200 OK` as defined in the [GraphQL Over HTTP
 Specification](https://github.com/graphql/graphql-over-http/blob/main/spec/GraphQLOverHTTP.md#applicationjson).

- **HTTP Status Code**: `200 OK`
- **Data**: `null`
- **Errors**: `Array<GraphQLError>` (`.length >= 1`)

#### Single error with `statusCode` property

When a GraphQL response contains a single error with the `statusCode` property set and no data, the HTTP Status Code is set to this value. See [ErrorWithProps](/docs/api/options.md#errorwithprops) for more details.

- **HTTP Status Code**: `Error statusCode`
- **Data**: `null`
- **Errors**: `Array<GraphQLError>` (`.length === 1`)

### Custom behaviour

If you wish to customise the default HTTP Status Code behaviour, one can do this using the [`errorFormatter`](/docs/api/options.md#plugin-options) option.
