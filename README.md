# mercurius

![CI workflow](https://github.com/fastify/fastify-oauth2/workflows/CI%20workflow/badge.svg)

Mercurius is [__GraphQL__](https://graphql.org/) adapter for [__Fastify__](https://www.fastify.io)

Features:

* Caching of query parsing and validation.
* Automatic loader integration to avoid 1 + N queries.
* Just-In-Time compiler via [graphql-jit](http://npm.im/graphql-jit).
* Subscriptions.
* Federation support.
* Gateway implementation, including Subscriptions.
* Batched query support.
* Customisable persisted queries.

## Documentation
* [API](/docs/api.md)
* [Related Plugins](/docs/related-plugins.md)
* [Nexus Schema Integration](/docs/nexus-schema.md)
* [Protocol Extension](/docs/protocol-extension.md)
* [Example](/docs/example.md)

## Install

```
npm i fastify mercurius
```

The previous name of this module is [fastify-gql](http://npm.im/fastify-gql) (< 6.0.0).

## Acknowledgements

The project is kindly sponsored by:

* [NearForm](https://www.nearform.com) for [Matteo](https://github.com/mcollina)'s time in maintaining this module.

The mercurius name was gracefully donated by [Marco Castelluccio](https://github.com/marco-c).
The usage of that library was described in https://hacks.mozilla.org/2015/12/web-push-notifications-from-irssi/, and
you can find that codebase in https://github.com/marco-c/mercurius.

## License

MIT
