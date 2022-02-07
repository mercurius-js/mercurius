# GraphQL over WebSocket

The GraphQL specification doesn't dictates which transport must be used in order to execute operations. In fact, GraphQL is _transport agnostic_, so implementors can choose which protocol makes more sense for each use case.

Generally, `query` and `mutation` are carried via HTTP, while `subscription` via WebSocket: this is the default behavior in `mercurius` and many other server implementations. However, `query` and `mutation` can also be sent through WebSocket.

## WebSocket subprotocol

As WebSocket is a generic and bidirectional way to send messages, **we need to agree about what each message _means_**: this is defined by the _subprotocol_.

### Supported subprotocols

The GraphQL over WebSocket Protocol (i.e. the WebSocket sub-protocol) used by default is called `graphql-transport-ws` and it's defined here:

- [`graphql-transport-ws` Protocol SPEC](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md)

> ⚠️ The subprotocol originally defined by Apollo's `subscriptions-transport-ws` library is also supported. However, that library is **UNMAINTAINED** so it's not recommended to be used: basically **deprecated**. More info [here](https://github.com/apollographql/subscriptions-transport-ws/).

### Supported clients

You should be able to use any major GraphQL client library in order to send operations via WebSocket (e.g. `graphql-ws`, `graphql-hooks`, `apollo`, `urql`…). Depending on which client you use, you have built in support or you may need to use some plugins or middleware.

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
