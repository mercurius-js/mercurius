import fastify, {
  FastifyError,
  FastifyReply,
  FastifyRequest,
  RegisterOptions
} from "fastify"
import { IResolvers } from "graphql-tools";
import { Server, IncomingMessage, ServerResponse } from "http";
import { Http2Server, Http2ServerRequest, Http2ServerResponse } from 'http2';
import graphql, { GraphQLSchema, GraphQLError, Source, DocumentNode, ExecutionResult } from 'graphql';

declare namespace FastifyGQL {

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
      HttpServer extends (Server | Http2Server),
      HttpRequest extends (IncomingMessage | Http2ServerRequest),
      HttpResponse extends (ServerResponse | Http2ServerResponse)
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
    }
  }
}

declare module "fastify" {
  interface FastifyInstance<HttpServer, HttpRequest, HttpResponse> {
    /**
     * GraphQL plugin
     */
    graphql: FastifyGQL.Plugin<HttpResponse>;
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
    ): FastifyReply<HttpResponse>;
  }
}

declare function fastifyGQL<
  HttpServer extends (Server | Http2Server),
  HttpRequest extends (IncomingMessage | Http2ServerRequest),
  HttpResponse extends (ServerResponse | Http2ServerResponse),
  Options = FastifyGQL.Options<HttpServer, HttpRequest, HttpResponse>
>(
  fastify: fastify.FastifyInstance<HttpServer, HttpRequest, HttpResponse>,
  opts: Options): void;

export = fastifyGQL;
