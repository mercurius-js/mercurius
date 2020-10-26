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
  GraphQLIsTypeOfFn,
  GraphQLTypeResolver,
  GraphQLScalarType,
  ValidationRule,
} from "graphql";
import { SocketStream } from "fastify-websocket"
import { IncomingMessage, IncomingHttpHeaders, OutgoingHttpHeaders } from "http";
import { Readable } from "stream";

export interface PubSub {
  subscribe<TResult = any>(topics: string | string[]): Promise<Readable & AsyncIterableIterator<TResult>>;
  publish<TResult = any>(event: { topic: string; payload: TResult }, callback?: () => void): void;
}

export interface MercuriusContext {
  app: FastifyInstance;
  /**
   * __Caution__: Only available if `subscriptions` are enabled
   */
  pubsub: PubSub;
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

interface MercuriusPlugin {
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
}

export interface MercuriusGatewayService {
  name: string;
  url: string;
  wsUrl?: string;
  mandatory?: boolean;
  initHeaders?: (() => OutgoingHttpHeaders | Promise<OutgoingHttpHeaders>) | OutgoingHttpHeaders;
  rewriteHeaders?: (headers: IncomingHttpHeaders) => OutgoingHttpHeaders;
  connections?: number;
  keepAliveMaxTimeout?: number;
  rejectUnauthorized?: boolean;
  wsConnectionParams?:
    | (() => WsConnectionParams | Promise<WsConnectionParams>)
    | WsConnectionParams;
}

export interface MercuriusGatewayOptions {
  /**
   * A list of GraphQL services to be combined into the gateway schema
   */
  gateway: {
    services: Array<MercuriusGatewayService>;
    pollingInterval?: number;
    errorHandler?(error: Error, service: MercuriusGatewayService): void
  };
}

export interface MercuriusSchemaOptions {
  /**
   * The GraphQL schema. String schema will be parsed
   */
  schema: GraphQLSchema | string | string[];
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
   * Serve GraphiQL on /graphiql if true or 'graphiql', or GraphQL IDE on /playground if 'playground' and if routes is true
   */
  graphiql?: boolean | string;
  ide?: boolean | string;
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
   * If a custom error handler is defined, it should return the standardized response format according to [GraphQL spec](https://graphql.org/learn/serving-over-http/#response).
   * @default true
   */
  errorHandler?:
    | boolean
    | ((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => ExecutionResult);
  /**
   * Change the default error formatter.
   */
  errorFormatter?: <TContext extends Record<string,any> = MercuriusContext>(
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

  /**
   * Settings for GraphQL Playground. These settings only apply if `graphiql` parameter is set to 'playground'.
   * The most current GraphQL Playground code is loaded via CDN, so new configuration settings may be available.
   * See https://github.com/prisma-labs/graphql-playground#usage for the most up-to-date list.
   */
  playgroundSettings?: {
    ['editor.cursorShape']: 'line' | 'block' | 'underline';
    ['editor.fontFamily']: string;
    ['editor.fontSize']: number;
    ['editor.reuseHeaders']: boolean;
    ['editor.theme']: 'dark' | 'light';
    ['general.betaUpdates']: boolean;
    ['prettier.printWidth']: number;
    ['prettier.tabWidth']: number;
    ['prettier.useTabs']: boolean;
    ['request.credentials']: 'omit' | 'include' | 'same-origin';
    ['schema.disableComments']: boolean;
    ['schema.polling.enable']: boolean;
    ['schema.polling.endpointFilter']: string;
    ['schema.polling.interval']: number;
    ['tracing.hideTracingResponse']: boolean;
    ['tracing.tracingSupported']: boolean;
  };
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
    constructor(message: string, extensions?: object);
    /**
     * Custom additional properties of this error
     */
    extensions?: object;
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
    execution: ExecutionResult,
    context: any
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
        mergeInfo: MergeInfo
      }
    ) => boolean | Promise<boolean>
  ) => (
    root: TSource,
    args: TArgs,
    context: TContext,
    info: GraphQLResolveInfo & {
      mergeInfo: MergeInfo
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
  __resolveType?: GraphQLTypeResolver<TSource, TContext>;
  __isTypeOf?: GraphQLIsTypeOfFn<TSource, TContext>;
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
      mergeInfo: MergeInfo;
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
