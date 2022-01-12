# GraphQL over WebSocket Protocol extension

The GraphQL over WebSocket Protocol `mercurius` uses by default is [graphql-transport-ws](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md). It also supports the protocol used by Apollo's `subscriptions-transport-ws`; however that library is **unmantained** so it's not recommended to use.

In order to achieve gateway-to-service communication and handle `connection_init` per client, an extension is used on the protocol for server-to-server communication. See https://github.com/mercurius-js/mercurius/issues/268 for more details about the original issue and the actual implemented solution.

## Message structure extension

This is the extended structure of each message:

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

## Server -> Server

### `connectionInit` extension

Gateway uses this extension to share the `connection_init` payload with a service when the connection is already established between gateway and services.

```ts
export interface ConnectionInitExtension extends OperationExtension {
  type: string;
  payload?: Object;
}
```

- `type: String` : 'connectionInit'
- `payload: Object` : optional parameters that the client specifies in connectionParams
