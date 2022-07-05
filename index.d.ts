import {
  FastifyError,
  FastifyReply,
  FastifyRequest,
  FastifyInstance,
} from "fastify";
import {
  DocumentNode,
  ExecutionResult,
  GraphQLSchema,
  Source,
  GraphQLResolveInfo,
  GraphQLScalarType,
  ValidationRule,
} from "graphql";
import { SocketStream } from "@fastify/websocket"
import { IncomingMessage, IncomingHttpHeaders, OutgoingHttpHeaders } from "http";
import { Readable } from "stream";

export interface PubSub {
  subscribe<TResult = any>(topics: string | string[]): Promise<Readable & AsyncIterableIterator<TResult>>;
  publish<TResult = any>(event: { topic: string; payload: TResult }, callback?: () => void): void;
}

export interface MercuriusContext {
  app: FastifyInstance;
  reply: FastifyReply;
  /**
   * __Caution__: Only available if `subscriptions` are enabled
   */
  pubsub: PubSub;
}

export interface MercuriusError<TError extends Error = Error> extends FastifyError {
  errors?: TError[]
}

export interface Loader<
  TObj extends Record<string, any> = any,
  TParams extends Record<string, any> = any,
  TContext extends Record<string, any> = MercuriusContext
> {
  (
    queries: Array<{
      obj: TObj;
      params: TParams;
    }>,
    context: TContext & {
      reply: FastifyReply;
    }
  ): any;
}

export interface MercuriusLoaders<TContext extends Record<string, any> = MercuriusContext> {
  [root: string]: {
    [field: string]:
      | Loader
      | {
          loader: Loader<any, any, TContext>;
          opts?: {
            cache?: boolean;
          };
        };
  };
}

/**
 * Federated GraphQL Service metadata
 */
export interface MercuriusServiceMetadata {
  name: string;
}

// ------------------------
// Request Lifecycle hooks
// ------------------------

/**
 * `preParsing` is the first hook to be executed in the GraphQL request lifecycle. The next hook will be `preValidation`.
 */
export interface preParsingHookHandler<TContext = MercuriusContext> {
  (
    schema: GraphQLSchema,
    source: string,
    context: TContext,
  ): Promise<void>;
}

/**
 * `preValidation` is the second hook to be executed in the GraphQL request lifecycle. The previous hook was `preParsing`, the next hook will be `preExecution`.
 */
export interface preValidationHookHandler<TContext = MercuriusContext> {
  (
    schema: GraphQLSchema,
    source: DocumentNode,
    context: TContext,
  ): Promise<void>;
}

/**
 * `preExecution` is the third hook to be executed in the GraphQL request lifecycle. The previous hook was `preValidation`, the next hook will be `preGatewayExecution`.
 * Notice: in the `preExecution` hook, you can modify the following items by returning them in the hook definition:
 *  - `document`
 *  - `errors`
 */
export interface preExecutionHookHandler<TContext = MercuriusContext, TError extends Error = Error> {
  (
    schema: GraphQLSchema,
    source: DocumentNode,
    context: TContext,
  ): Promise<PreExecutionHookResponse<TError> | void>;
}

/**
 * `preGatewayExecution` is the fourth hook to be executed in the GraphQL request lifecycle. The previous hook was `preExecution`, the next hook will be `onResolution`.
 * Notice: in the `preExecution` hook, you can modify the following items by returning them in the hook definition:
 *  - `document`
 *  - `errors`
 * This hook will only be triggered in gateway mode. When in gateway mode, each hook definition will trigger multiple times in a single request just before executing remote GraphQL queries on the federated services.
 *
 * Because it is a gateway hook, this hook contains service metadata in the `service` parameter:
 *  - `name`: service name
 */
export interface preGatewayExecutionHookHandler<TContext = MercuriusContext, TError extends Error = Error> {
  (
    schema: GraphQLSchema,
    source: DocumentNode,
    context: TContext,
    service: MercuriusServiceMetadata
  ): Promise<PreExecutionHookResponse<TError> | void>;
}

/**
 * `onResolution` is the fifth and final hook to be executed in the GraphQL request lifecycle. The previous hook was `preExecution`.
 */
export interface onResolutionHookHandler<TData extends Record<string, any> = Record<string, any>, TContext = MercuriusContext> {
  (
    execution: ExecutionResult<TData>,
    context: TContext,
  ): Promise<void>;
}

// -----------------------------
// Subscription Lifecycle hooks
// -----------------------------

/**
 * `preSubscriptionParsing` is the first hook to be executed in the GraphQL subscription lifecycle. The next hook will be `preSubscriptionExecution`.
 * This hook will only be triggered when subscriptions are enabled.
 */
export interface preSubscriptionParsingHookHandler<TContext = MercuriusContext> {
  (
    schema: GraphQLSchema,
    source: string,
    context: TContext,
  ): Promise<void>;
}

/**
 * `preSubscriptionExecution` is the second hook to be executed in the GraphQL subscription lifecycle. The previous hook was `preSubscriptionParsing`, the next hook will be `preGatewaySubscriptionExecution`.
 * This hook will only be triggered when subscriptions are enabled.
 */
export interface preSubscriptionExecutionHookHandler<TContext = MercuriusContext> {
  (
    schema: GraphQLSchema,
    source: DocumentNode,
    context: TContext,
  ): Promise<void>;
}

/**
 * `preGatewaySubscriptionExecution` is the third hook to be executed in the GraphQL subscription lifecycle. The previous hook was `preSubscriptionExecution`, the next hook will be `onSubscriptionResolution`.
 * This hook will only be triggered in gateway mode when subscriptions are enabled.
 *
 * Because it is a gateway hook, this hook contains service metadata in the `service` parameter:
 *  - `name`: service name
 */
export interface preGatewaySubscriptionExecutionHookHandler<TContext = MercuriusContext> {
  (
    schema: GraphQLSchema,
    source: DocumentNode,
    context: TContext,
    service: MercuriusServiceMetadata
  ): Promise<void>;
}

/**
 * `onSubscriptionResolution` is the fourth hook to be executed in the GraphQL subscription lifecycle. The previous hook was `preGatewaySubscriptionExecution`, the next hook will be `onSubscriptionEnd`.
 * This hook will only be triggered when subscriptions are enabled.
 */
export interface onSubscriptionResolutionHookHandler<TData extends Record<string, any> = Record<string, any>, TContext = MercuriusContext> {
  (
    execution: ExecutionResult<TData>,
    context: TContext,
  ): Promise<void>;
}

/**
 * `onSubscriptionEnd` is the fifth and final hook to be executed in the GraphQL subscription lifecycle. The previous hook was `onSubscriptionResolution`.
 * This hook will only be triggered when subscriptions are enabled.
 */
export interface onSubscriptionEndHookHandler<TContext = MercuriusContext> {
  (
    context: TContext,
  ): Promise<void>;
}

// ----------------------------
// Application Lifecycle hooks
// ----------------------------

/**
 * `onGatewayReplaceSchema` is an application lifecycle hook. When the Gateway service obtains new versions of federated schemas within a defined polling interval, the `onGatewayReplaceSchema` hook will be triggered every time a new schema is built. It is called just before the old schema is replaced with the new one.
 * This hook will only be triggered in gateway mode. It has the following parameters:
 *  - `instance` - The gateway server `FastifyInstance` (this contains the old schema).
 *  - `schema` - The new schema that has been built from the gateway refresh.
 */
export interface onGatewayReplaceSchemaHookHandler {
  (
    instance: FastifyInstance,
    schema: GraphQLSchema
  ): Promise<void>;
}

interface ServiceConfig {
  setSchema: (schema: string) => ServiceConfig;
}

interface Gateway {
  refresh: (isRetry?: boolean) => Promise<GraphQLSchema | null>;
  serviceMap: Record<string, ServiceConfig>;
}

export interface MercuriusPlugin {
  <
    TData extends Record<string, any> = Record<string, any>,
    TVariables extends Record<string, any> = Record<string, any>
  >(
    source: string,
    context?: Record<string, any>,
    variables?: TVariables,
    operationName?: string
  ): Promise<ExecutionResult<TData>>;
  /**
   * Replace existing schema
   * @param schema graphql schema
   */
  replaceSchema(schema: GraphQLSchema): void;
  /**
   * Extend existing schema
   * @param schema graphql schema
   */
  extendSchema(schema: string | Source | DocumentNode): void;
  /**
   * Define additional resolvers
   * @param resolvers object with resolver functions
   */
  defineResolvers<TContext = MercuriusContext>(resolvers: IResolvers<any, TContext>): void;
  /**
   * Define data loaders
   * @param loaders object with data loader functions
   */
  defineLoaders<TContext = MercuriusContext>(loaders: MercuriusLoaders<TContext>): void;
  /**
   * Transform the existing schema
   */
  transformSchema: (
    schemaTransforms:
      | ((schema: GraphQLSchema) => GraphQLSchema)
      | Array<(schema: GraphQLSchema) => GraphQLSchema>
  ) => void;
  /**
   * __Caution__: Only available if `subscriptions` are enabled
   */
  pubsub: PubSub;
  /**
   * Managed GraphQL schema object for doing custom execution with. Will reflect changes made via `extendSchema`, `defineResolvers`, etc.
   */
  schema: GraphQLSchema;

  gateway: Gateway;

  // addHook: overloads

  // Request lifecycle addHooks

  /**
   * `preParsing` is the first hook to be executed in the GraphQL request lifecycle. The next hook will be `preValidation`.
   */
  addHook<TContext = MercuriusContext>(name: 'preParsing', hook: preParsingHookHandler<TContext>): void;

  /**
   * `preValidation` is the second hook to be executed in the GraphQL request lifecycle. The previous hook was `preParsing`, the next hook will be `preExecution`.
   */
  addHook<TContext = MercuriusContext>(name: 'preValidation', hook: preValidationHookHandler<TContext>): void;

  /**
   * `preExecution` is the third hook to be executed in the GraphQL request lifecycle. The previous hook was `preValidation`, the next hook will be `preGatewayExecution`.
   * Notice: in the `preExecution` hook, you can modify the following items by returning them in the hook definition:
   *  - `document`
   *  - `errors`
   */
  addHook<TContext = MercuriusContext, TError extends Error = Error>(name: 'preExecution', hook: preExecutionHookHandler<TContext, TError>): void;

  /**
   * `preGatewayExecution` is the fourth hook to be executed in the GraphQL request lifecycle. The previous hook was `preExecution`, the next hook will be `onResolution`.
   * Notice: in the `preExecution` hook, you can modify the following items by returning them in the hook definition:
   *  - `document`
   *  - `errors`
   * This hook will only be triggered in gateway mode. When in gateway mode, each hook definition will trigger multiple times in a single request just before executing remote GraphQL queries on the federated services.
   */
  addHook<TContext = MercuriusContext, TError extends Error = Error>(name: 'preGatewayExecution', hook: preGatewayExecutionHookHandler<TContext, TError>): void;

  /**
   * `onResolution` is the fifth and final hook to be executed in the GraphQL request lifecycle. The previous hook was `preExecution`.
   */
  addHook<TData extends Record<string, any> = Record<string, any>, TContext = MercuriusContext>(name: 'onResolution', hook: onResolutionHookHandler<TData, TContext>): void;

  // Subscription lifecycle addHooks

  /**
   * `preSubscriptionParsing` is the first hook to be executed in the GraphQL subscription lifecycle. The next hook will be `preSubscriptionExecution`.
   * This hook will only be triggered when subscriptions are enabled.
   */
  addHook<TContext = MercuriusContext>(name: 'preSubscriptionParsing', hook: preSubscriptionParsingHookHandler<TContext>): void;

  /**
   * `preSubscriptionExecution` is the second hook to be executed in the GraphQL subscription lifecycle. The previous hook was `preSubscriptionParsing`, the next hook will be `preGatewaySubscriptionExecution`.
   * This hook will only be triggered when subscriptions are enabled.
   */
  addHook<TContext = MercuriusContext>(name: 'preSubscriptionExecution', hook: preSubscriptionExecutionHookHandler<TContext>): void;

  /**
   * `preGatewaySubscriptionExecution` is the third hook to be executed in the GraphQL subscription lifecycle. The previous hook was `preSubscriptionExecution`, the next hook will be `onSubscriptionResolution`.
   * This hook will only be triggered in gateway mode when subscriptions are enabled.
   */
  addHook<TContext = MercuriusContext>(name: 'preGatewaySubscriptionExecution', hook: preGatewaySubscriptionExecutionHookHandler<TContext>): void;

  /**
   * `onSubscriptionResolution` is the fourth and final hook to be executed in the GraphQL subscription lifecycle. The previous hook was `preGatewaySubscriptionExecution`.
   * This hook will only be triggered when subscriptions are enabled.
   */
  addHook<TData extends Record<string, any> = Record<string, any>, TContext = MercuriusContext>(name: 'onSubscriptionResolution', hook: onSubscriptionResolutionHookHandler<TData, TContext>): void;

  /**
   * `onSubscriptionEnd` is the fifth and final hook to be executed in the GraphQL subscription lifecycle. The previous hook was `onSubscriptionResolution`.
   * This hook will only be triggered when subscriptions are enabled.
   */
  addHook<TContext = MercuriusContext>(name: 'onSubscriptionEnd', hook: onSubscriptionEndHookHandler<TContext>): void;

  // Application lifecycle addHooks

  /**
   * `onGatewayReplaceSchema` is an application lifecycle hook. When the Gateway service obtains new versions of federated schemas within a defined polling interval, the `onGatewayReplaceSchema` hook will be triggered every time a new schema is built. It is called just before the old schema is replaced with the new one.
   * This hook will only be triggered in gateway mode. It has the following parameters:
   *  - `instance` - The gateway server `FastifyInstance` (this contains the old schema).
   *  - `schema` - The new schema that has been built from the gateway refresh.
   */
  addHook(name: 'onGatewayReplaceSchema', hook: onGatewayReplaceSchemaHookHandler): void;
}

interface QueryRequest {
  operationName?: string;
  query: string;
  variables?: object;
  extensions?: object;
}

interface WsConnectionParams {
  connectionInitPayload?:
    | (() => Record<string, any> | Promise<Record<string, any>>)
    | Record<string, any>;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  connectionCallback?: () => void;
  failedConnectionCallback?: (err: { message: string }) => void | Promise<void>;
  failedReconnectCallback?: () => void;
  rewriteConnectionInitPayload?:  <TContext extends MercuriusContext = MercuriusContext>(payload: Record<string, any> | undefined, context: TContext) => Record<string, any>;
}

export interface MercuriusGatewayService {
  name: string;
  url: string | string[];
  schema?: string;
  wsUrl?: string;
  mandatory?: boolean;
  initHeaders?:
    | (() => OutgoingHttpHeaders | Promise<OutgoingHttpHeaders>)
    | OutgoingHttpHeaders;
  rewriteHeaders?: <TContext extends MercuriusContext = MercuriusContext>(
    headers: IncomingHttpHeaders,
    context: TContext
  ) => OutgoingHttpHeaders | Promise<OutgoingHttpHeaders>;
  connections?: number;
  keepAlive?: number;
  keepAliveMaxTimeout?: number;
  rejectUnauthorized?: boolean;
  wsConnectionParams?:
    | (() => WsConnectionParams | Promise<WsConnectionParams>)
    | WsConnectionParams;
  setResponseHeaders?: (reply:FastifyReply) => void;
}

export interface MercuriusGatewayOptions {
  /**
   * A list of GraphQL services to be combined into the gateway schema
   */
  gateway: {
    services: Array<MercuriusGatewayService>;
    pollingInterval?: number;
    errorHandler?(error: Error, service: MercuriusGatewayService): void;
    retryServicesCount?: number;
    retryServicesInterval?: number;
  };
}

export interface MercuriusSchemaOptions {
  /**
   * The GraphQL schema. String schema will be parsed
   */
  schema?: GraphQLSchema | string | string[];
  /**
   * Object with resolver functions
   */
  resolvers?: IResolvers;
  /**
   * Object with data loader functions
   */
  loaders?: MercuriusLoaders;
  /**
   * Schema transformation function or an array of schema transformation functions
   */
  schemaTransforms?: ((originalSchema: GraphQLSchema) => GraphQLSchema) | Array<(originalSchema: GraphQLSchema) => GraphQLSchema>;
}

export interface MercuriusCommonOptions {
  /**
   * Serve GraphiQL on /graphiql if true or 'graphiql' and if routes is true
   */
  graphiql?: boolean | 'graphiql';
  ide?: boolean | 'graphiql';
  /**
   * The minimum number of execution a query needs to be executed before being jit'ed.
   * @default true
   */
  jit?: number;
  /**
   * A graphql endpoint is exposed at /graphql when true
   * @default true
   */
  routes?: boolean;
  /**
   * Define if the plugin can cache the responses.
   * @default true
   */
  cache?: boolean | number;
  /**
   * An endpoint for graphql if routes is true
   * @default '/graphql'
   */
  path?: string;
  /**
   * Change the route prefix of the graphql endpoint if set
   */
  prefix?: string;
  /**
   * Add the empty Mutation definition if schema is not defined
   * @default false
   */
  defineMutation?: boolean;
  /**
   * Change the default error handler (Default: true).
   * If a custom error handler is defined, it should send the standardized response format according to [GraphQL spec](https://graphql.org/learn/serving-over-http/#response) using `reply.send`.
   * @default true
   */
  errorHandler?:
    | boolean
    | ((error: MercuriusError, request: FastifyRequest, reply: FastifyReply) => void | Promise<void>);
  /**
   * Change the default error formatter.
   */
  errorFormatter?: <TContext extends MercuriusContext = MercuriusContext>(
    execution: ExecutionResult,
    context: TContext
  ) => {
    statusCode: number;
    response: ExecutionResult;
  };
  /**
   * The maximum depth allowed for a single query.
   */
  queryDepth?: number;
  context?: (
    request: FastifyRequest,
    reply: FastifyReply
  ) => Promise<Record<string, any>> | Record<string, any>;
  /**
   * Optional additional validation rules.
   * Queries must satisfy these rules in addition to those defined by the GraphQL specification.
   */
  validationRules?: ValidationRules;
  /**
   * Enable subscription support when options are provided. [`emitter`](https://github.com/mcollina/mqemitter) property is required when subscriptions is an object. (Default false)
   */
  subscription?:
    | boolean
    | {
        emitter?: object;
        pubsub?: any; // FIXME: Technically this should be the PubSub type. But PubSub is now typed as SubscriptionContext.
        verifyClient?: (
          info: { origin: string; secure: boolean; req: IncomingMessage },
          next: (
            result: boolean,
            code?: number,
            message?: string,
            headers?: OutgoingHttpHeaders
          ) => void
        ) => void;
        context?: (
          connection: SocketStream,
          request: FastifyRequest
        ) => Record<string, any> | Promise<Record<string, any>>;
        onConnect?: (data: {
          type: 'connection_init';
          payload: any;
        }) => Record<string, any> | Promise<Record<string, any>>;
        onDisconnect?: (context: MercuriusContext) => void | Promise<void>;
        keepAlive?: number,
        fullWsTransport?: boolean,
      };
  /**
   * Enable federation metadata support so the service can be deployed behind an Apollo Gateway
   */
  federationMetadata?: boolean;
  /**
   * Persisted queries, overrides persistedQueryProvider.
   */
  persistedQueries?: Record<string,string>;
  /**
   * Only allow persisted queries. Required persistedQueries, overrides persistedQueryProvider.
   */
  onlyPersisted?: boolean;
  /**
   * Settings for enabling persisted queries.
   */
  persistedQueryProvider?: mercurius.PersistedQueryProvider;

  /**
   * Enable support for batched queries (POST requests only).
   * Batched query support allows clients to send an array of queries and
   * receive an array of responses within a single request.
   */
  allowBatchedQueries?: boolean;
}

export type MercuriusOptions = MercuriusCommonOptions & (MercuriusGatewayOptions | MercuriusSchemaOptions)

declare function mercurius
  (
    instance: FastifyInstance,
    opts: MercuriusOptions
  ): void;


declare namespace mercurius {
  interface PersistedQueryProvider {
    /**
     *  Return true if a given request matches the desired persisted query format.
     */
    isPersistedQuery: (r: QueryRequest) => boolean;
    /**
     *  Return the hash from a given request, or falsy if this request format is not supported.
     */
    getHash: (r: QueryRequest) => string;
    /**
     *  Return the query for a given hash.
     */
    getQueryFromHash: (hash: string) => Promise<string>;
    /**
     *  Return the hash for a given query string. Do not provide if you want to skip saving new queries.
     */
    getHashForQuery?: (query: string) => string;
    /**
     *  Save a query, given its hash.
     */
    saveQuery?: (hash: string, query: string) => Promise<void>;
    /**
     * An error message to return when getQueryFromHash returns a falsy result. Defaults to 'Bad Request'.
     */
    notFoundError?: string;
    /**
     * An error message to return when a query matches isPersistedQuery, but fasly from getHash. Defaults to 'Bad Request'.
     */
    notSupportedError?: string;
  }

  /**
   * @deprecated Use `PersistedQueryProvider`
   */
  interface PeristedQueryProvider extends PersistedQueryProvider {}

  /**
   * Extended errors for adding additional information in error responses
   */
  class ErrorWithProps extends Error {
    constructor(message: string, extensions?: object, statusCode?: number);
    /**
     * Custom additional properties of this error
     */
    extensions?: object;
    statusCode?: number;
  }

  /**
   * Default options for persisted queries.
   */
  const persistedQueryDefaults: {
    prepared: (persistedQueries: object) => PersistedQueryProvider;
    preparedOnly: (persistedQueries: object) => PersistedQueryProvider;
    automatic: (maxSize?: number) => PersistedQueryProvider;
  };

  /**
   * Default error formatter.
   */
  const defaultErrorFormatter: (
    execution: ExecutionResult | Error,
    context: MercuriusContext
  ) => { statusCode: number; response: ExecutionResult };

  /**
   * Builds schema with support for federation mode.
   */
  const buildFederationSchema: (schema: string) => GraphQLSchema;

  /**
   * Subscriptions with filter functionality
   */
  const withFilter: <
    TPayload = any,
    TSource = any,
    TContext = MercuriusContext,
    TArgs = Record<string, any>
  >(
    subscribeFn: IFieldResolver<TSource, TContext, TArgs>,
    filterFn: (
      payload: TPayload,
      args: TArgs,
      context: TContext,
      info: GraphQLResolveInfo & {
        mergeInfo?: MergeInfo
      }
    ) => boolean | Promise<boolean>
  ) => (
    root: TSource,
    args: TArgs,
    context: TContext,
    info: GraphQLResolveInfo & {
      mergeInfo?: MergeInfo
    }
  ) => AsyncGenerator<TPayload>
}

export default mercurius;

declare module "fastify" {
  interface FastifyInstance {
    /**
     * GraphQL plugin
     */
    graphql: MercuriusPlugin;
  }

  interface FastifyReply {
    /**
     * @param source GraphQL query string
     * @param context request context
     * @param variables request variables which will get passed to the executor
     * @param operationName specify which operation will be run
     */
    graphql<
      TData extends Record<string, any> = Record<string, any>,
      TVariables extends Record<string, any> = Record<string, any>
    >(
      source: string,
      context?: Record<string, any>,
      variables?: TVariables,
      operationName?: string
    ): Promise<ExecutionResult<TData>>;
  }
}

export interface IResolvers<TSource = any, TContext = MercuriusContext> {
  [key: string]:
    | (() => any)
    | IResolverObject<TSource, TContext>
    | IResolverOptions<TSource, TContext>
    | GraphQLScalarType
    | IEnumResolver
    | undefined;
}

export type IResolverObject<TSource = any, TContext = MercuriusContext, TArgs = any> = {
  [key: string]:
    | IFieldResolver<TSource, TContext, TArgs>
    | IResolverOptions<TSource, TContext>
    | IResolverObject<TSource, TContext>
    | undefined;
}

export interface IResolverOptions<TSource = any, TContext = MercuriusContext, TArgs = any> {
  fragment?: string;
  resolve?: IFieldResolver<TSource, TContext, TArgs>;
  subscribe?: IFieldResolver<TSource, TContext, TArgs>;
}

type IEnumResolver = {
  [key: string]: string | number;
};

export interface IFieldResolver<TSource, TContext = MercuriusContext, TArgs = Record<string, any>> {
  (
    source: TSource,
    args: TArgs,
    context: TContext,
    info: GraphQLResolveInfo & {
      mergeInfo?: MergeInfo;
    }
  ): any;
}

type MergeInfo = {
  delegate: (
    type: "query" | "mutation" | "subscription",
    fieldName: string,
    args: {
      [key: string]: any;
    },
    context: {
      [key: string]: any;
    },
    info: GraphQLResolveInfo,
    transforms?: Array<Transform>
  ) => any;
  delegateToSchema<TContext>(options: IDelegateToSchemaOptions<TContext>): any;
  fragments: Array<{
    field: string;
    fragment: string;
  }>;
};

type Transform = {
  transformSchema?: (schema: GraphQLSchema) => GraphQLSchema;
  transformRequest?: (originalRequest: Request) => Request;
  transformResult?: (result: Result) => Result;
};

interface IDelegateToSchemaOptions<
  TContext = {
    [key: string]: any;
  }
> {
  schema: GraphQLSchema;
  operation: Operation;
  fieldName: string;
  args?: {
    [key: string]: any;
  };
  context: TContext;
  info: IGraphQLToolsResolveInfo;
  transforms?: Array<Transform>;
  skipValidation?: boolean;
}

type Operation = "query" | "mutation" | "subscription";

type Result = ExecutionResult & {
  extensions?: Record<string, any>;
};

interface IGraphQLToolsResolveInfo extends GraphQLResolveInfo {
  mergeInfo?: MergeInfo;
}

type Request = {
  document: DocumentNode;
  variables: Record<string, any>;
  extensions?: Record<string, any>;
};

type ValidationRules =
  | ValidationRule[]
  | ((params: {
      source: string;
      variables?: Record<string, any>;
      operationName?: string;
    }) => ValidationRule[]);

export interface PreExecutionHookResponse<TError extends Error> {
  schema?: GraphQLSchema
  document?: DocumentNode
  errors?: TError[]
}
