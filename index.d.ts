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
  GraphQLError,
  Source,
  GraphQLResolveInfo,
  GraphQLIsTypeOfFn,
  GraphQLTypeResolver,
  GraphQLScalarType,
  ValidationRule,
} from "graphql";
import { SocketStream } from "fastify-websocket"
import { IncomingMessage, OutgoingHttpHeaders } from "http";

declare interface FastifyGQLPlugin {
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
  defineResolvers(resolvers: IResolvers): void;
  /**
   * Define data loaders
   * @param loaders object with data loader functions
   */
  defineLoaders(loaders: {
    [key: string]: {
      [key: string]: (
        queries: Array<{
          obj: any;
          params: any;
        }>,
        context: {
          reply: FastifyReply;
        }
      ) => any;
    };
  }): void;
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

type FastifyGQLGatewayService = {
  name: string;
  url: string;
  mandatory?: boolean;
}

export interface FastifyGQLGatewayOptions {
  /**
   * A list of GraphQL services to be combined into the gateway schema
   */
  gateway: {
    services: Array<FastifyGQLGatewayService>;
    pollingInterval?: number;
    errorHandler?(error: Error, service: FastifyGQLGatewayService): void
  };
}

export interface FastifyGQLSchemaOptions {
  /**
   * The GraphQL schema. String schema will be parsed
   */
  schema: GraphQLSchema | string;
  /**
   * Object with resolver functions
   */
  resolvers?: IResolvers;
  /**
   * Object with data loader functions
   */
  loaders?: {
    [key: string]: {
      [key: string]: (
        queries: Array<{
          obj: any;
          params: any;
        }>,
        context: {
          reply: FastifyReply;
        }
      ) => any;
    };
  };
}

export interface FastifyGQLCommonOptions {
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
  cache?: boolean;
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
    | ((
        error: FastifyError,
        request: FastifyRequest,
        reply: FastifyReply
      ) => ExecutionResult);
  /**
   * Change the default error formatter.
   */
  errorFormatter?: ((
    execution: ExecutionResult,
    context: any,
  ) => {
    statusCode: number,
    response: ExecutionResult,
  });
  /**
   * The maximum depth allowed for a single query.
   */
  queryDepth?: number;
  context?: (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
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
          next: (result: boolean, code?: number, message?: string, headers?: OutgoingHttpHeaders) => void
        ) => void,
        context?: (connection: SocketStream, request: FastifyRequest) => object | Promise<object>
        onConnect?: (data: { type: "connection_init", payload: any }) => object | Promise<object>
      };
  /**
   * Enable federation metadata support so the service can be deployed behind an Apollo Gateway
   */
  federationMetadata?: boolean;
  /**
   * Persisted queries, overrides persistedQueryProvider.
   */
  persistedQueries?: object;
  /**
   * Only allow persisted queries. Required persistedQueries, overrides persistedQueryProvider.
   */
  onlyPersisted?: boolean;
  /**
   * Settings for enabling persisted queries.
   */
  persistedQueryProvider?: fastifyGQL.PeristedQueryProvider;

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

export type FastifyGQLOptions = FastifyGQLCommonOptions & (FastifyGQLGatewayOptions | FastifyGQLSchemaOptions)

declare function fastifyGQL
  (
    instance: FastifyInstance,
    opts: FastifyGQLOptions
  ): void;


declare namespace fastifyGQL {
  interface PeristedQueryProvider {
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
    prepared: (persistedQueries: object) => PeristedQueryProvider;
    preparedOnly: (persistedQueries: object) => PeristedQueryProvider;
    automatic: (maxSize?: number) => PeristedQueryProvider;
  };

  /**
   * Default error formatter.
   */
  const defaultErrorFormatter: (
    execution: ExecutionResult,
    context: any
  ) => { statusCode: number, response: ExecutionResult };
}

export default fastifyGQL;

declare module "fastify" {
  interface FastifyInstance {
    /**
     * GraphQL plugin
     */
    graphql: FastifyGQLPlugin;
  }

  interface FastifyReply {
    /**
     * @param source GraphQL query string
     * @param context request context
     * @param variables request variables which will get passed to the executor
     * @param operationName specify which operation will be run
     */
    graphql(
      source: string,
      context?: any,
      variables?: { [key: string]: any },
      operationName?: string
    ): Promise<ExecutionResult>;
  }
}

interface IResolvers<TSource = any, TContext = any> {
  [key: string]:
    | (() => any)
    | IResolverObject<TSource, TContext>
    | IResolverOptions<TSource, TContext>
    | GraphQLScalarType
    | IEnumResolver;
}

type IResolverObject<TSource = any, TContext = any, TArgs = any> = {
  [key: string]:
    | IFieldResolver<TSource, TContext, TArgs>
    | IResolverOptions<TSource, TContext>
    | IResolverObject<TSource, TContext>;
};

interface IResolverOptions<TSource = any, TContext = any, TArgs = any> {
  fragment?: string;
  resolve?: IFieldResolver<TSource, TContext, TArgs>;
  subscribe?: IFieldResolver<TSource, TContext, TArgs>;
  __resolveType?: GraphQLTypeResolver<TSource, TContext>;
  __isTypeOf?: GraphQLIsTypeOfFn<TSource, TContext>;
}

type IEnumResolver = {
  [key: string]: string | number;
};

type IFieldResolver<TSource, TContext, TArgs = Record<string, any>> = (
  source: TSource,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo & {
    mergeInfo: MergeInfo;
  }
) => any;

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
