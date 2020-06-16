import fastify, { FastifyError, FastifyReply, FastifyRequest, RegisterOptions } from "fastify";
import { DocumentNode, ExecutionResult, GraphQLSchema, Source, GraphQLResolveInfo, GraphQLIsTypeOfFn, GraphQLTypeResolver, GraphQLScalarType } from 'graphql';
import { IncomingMessage, Server, ServerResponse } from "http";
import { Http2Server, Http2ServerRequest, Http2ServerResponse } from 'http2';

declare namespace fastifyGQL {

  export interface Plugin<HttpResponse> {
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
            obj: any,
            params: any
          }>,
          context: {
            reply: FastifyReply<HttpResponse>
          }) => any
      }
    }): void;
  }

  export interface Options<
      HttpServer extends (Server | Http2Server) = Server,
      HttpRequest extends (IncomingMessage | Http2ServerRequest) = IncomingMessage,
      HttpResponse extends (ServerResponse | Http2ServerResponse) = ServerResponse
    > extends RegisterOptions<HttpServer, HttpRequest, HttpResponse> {
    /**
     * The GraphQL schema. String schema will be parsed
     */
    schema: GraphQLSchema | string,
    /**
     * Object with resolver functions
     */
    resolvers: IResolvers,
    /**
     * Object with data loader functions
     */
    loaders?: {
      [key: string]: {
        [key: string]: (
          queries: Array<{
            obj: any,
            params: any
          }>,
          context: {
            reply: FastifyReply<HttpResponse>
          }) => any
      }
    },
    /**
     * Serve GraphiQL on /graphiql if true or 'graphiql', or GraphQL IDE on /playground if 'playground' and if routes is true
     */
		graphiql?: boolean | string,
		ide?: boolean | string,
    /**
     * The minimum number of execution a query needs to be executed before being jit'ed.
     * @default true
     */
    jit?: number,
    /**
     * A graphql endpoint is exposed at /graphql when true
     * @default true
     */
    routes?: boolean,
    /**
     * An endpoint for graphql if routes is true
     * @default '/graphql'
     */
    path?: string,
    /**
     * Change the route prefix of the graphql endpoint if set
     */
    prefix?: string,
    /**
     * Add the empty Mutation definition if schema is not defined
     * @default false
     */
    defineMutation?: boolean,
    /**
     * Change the default error handler (Default: true).
     * If a custom error handler is defined, it should return the standardized response format according to [GraphQL spec](https://graphql.org/learn/serving-over-http/#response).
     * @default true
     */
    errorHandler?: boolean | ((
      error: FastifyError,
      request: FastifyRequest<HttpRequest>,
      reply: FastifyReply<HttpResponse>
    ) => ExecutionResult),
    /**
     * The maximum depth allowed for a single query.
     */
    queryDepth?: number,
    context?: (request: FastifyRequest<HttpRequest>, reply: FastifyReply<HttpResponse>) => Promise<any>,
    /**
     * Enable subscription support when options are provided. [`emitter`](https://github.com/mcollina/mqemitter) property is required when subscriptions is an object. (Default false)
     */
    subscription?: boolean | {
      emitter?: object,
      verifyClient?: (
        info: object,
        next: (result: boolean) => void
      ) => void
    },
    /**
     * Enable federation metadata support so the service can be deployed behind an Apollo Gateway
     */
    federationMetadata?: boolean
    /**
     * A list of GraphQL services to be combined into the gateway schema
     */
    gateway?: {
      services: Array<{
        name: string
        url: string
      }>
    }
    /**
     * Enable support for batched queries (POST requests only).
     * Batched query support allows clients to send an array of queries and
     * receive an array of responses within a single request.
     */
    allowBatchedQueries?: boolean
    /**
     * Enable support for Automatic Persisted Queries, compatible with apollo-client
     */
    enableApolloAPQ?: boolean
  }

  /**
   * Extended errors for adding additional information in error responses
   */
  export class ErrorWithProps extends Error {
    constructor (message: string, extensions?: object)
    /**
     * Custom additional properties of this error
     */
    extensions?: object
  } 
}

declare module "fastify" {
  interface FastifyInstance<HttpServer, HttpRequest, HttpResponse> {
    /**
     * GraphQL plugin
     */
    graphql: fastifyGQL.Plugin<HttpResponse>;
  }

  interface FastifyReply<HttpResponse> {
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

declare function fastifyGQL<
  HttpServer extends (Server | Http2Server) = Server,
  HttpRequest extends (IncomingMessage | Http2ServerRequest) = IncomingMessage,
  HttpResponse extends (ServerResponse | Http2ServerResponse) = ServerResponse,
  Options = fastifyGQL.Options<HttpServer, HttpRequest, HttpResponse>
>(
  fastify: fastify.FastifyInstance<HttpServer, HttpRequest, HttpResponse>,
  opts: Options): void;


export = fastifyGQL;

interface IResolvers<TSource = any, TContext = any> {
  [key: string]: (() => any) | IResolverObject<TSource, TContext> | IResolverOptions<TSource, TContext> | GraphQLScalarType | IEnumResolver;
}

type IResolverObject<TSource = any, TContext = any, TArgs = any> = {
  [key: string]: IFieldResolver<TSource, TContext, TArgs> | IResolverOptions<TSource, TContext> | IResolverObject<TSource, TContext>;
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

type IFieldResolver<TSource, TContext, TArgs = Record<string, any>> = (source: TSource, args: TArgs, context: TContext, info: GraphQLResolveInfo & {
  mergeInfo: MergeInfo;
}) => any;

type MergeInfo = {
  delegate: (type: 'query' | 'mutation' | 'subscription', fieldName: string, args: {
      [key: string]: any;
  }, context: {
      [key: string]: any;
  }, info: GraphQLResolveInfo, transforms?: Array<Transform>) => any;
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

interface IDelegateToSchemaOptions<TContext = {
  [key: string]: any;
}> {
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

type Operation = 'query' | 'mutation' | 'subscription';

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
