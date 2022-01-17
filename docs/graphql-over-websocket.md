# GraphQL over WebSocket

The GraphQL specification doesn't dictates which transport must be used in order to execute operations. In fact, GraphQL is _transport agnostic_, so implementors can choose which protocol makes more sense for each use case.

Generally, `query` and `mutation` are carried via HTTP, while `subscription` via WebSocket: this is the default behavior in `mercurius` and many other server implementations.

However, you can also choose to enable `query` and `mutation` via WebSocket. If you want to do so, pass `fullWsTransport: true` on the options, like in [this example](../examples/full-ws-transport.md). You should be able to use any GraphQL client e.g. `graphql-ws`, `apollo`, `urql`, `graphql-hooks`, _etc._ in order to send every operation via WebSocket.

## Protocol

The GraphQL over WebSocket Protocol (i.e. the WebSocket sub-protocol) `mercurius` uses by default is [graphql-transport-ws](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md). It also supports the protocol used by Apollo's `subscriptions-transport-ws`; however that library is **unmaintained** so it's not recommended to use.

## Extensions

The `extensions` field is reserved for things that implementors want to add on top of the spec.

### Message structure

This is the structure allowed on each WS message:

```ts
export interface OperationMessage {
  payload?: any;
  id?: string;
  type: string;

  extensions?: Array<OperationExtension>;
}

export interface OperationExtension {
  type: string;
  payload?: any;
}
```

### Server -> Server

In order to achieve _gateway-to-service_ communication and handle `connection_init` per client, an extension is used on the protocol for _server-to-server_ communication. See https://github.com/mercurius-js/mercurius/issues/268 for more details about the original issue and the actual implemented solution.

#### `connectionInit` extension

Gateway uses this extension to share the `connection_init` payload with a service when the connection is already established between gateway and services.

```ts
export interface ConnectionInitExtension extends OperationExtension {
  type: string;
  payload?: Object;
}
```

- `type: String` : 'connectionInit'
- `payload: Object` : optional parameters that the client specifies in connectionParams
