import fastify, {
  FastifyError,
  FastifyReply,
  FastifyRequest,
  RegisterOptions
} from "fastify"
import { IResolvers } from "graphql-tools";
import { Server, IncomingMessage, ServerResponse } from "http";
import graphql, { GraphQLSchema, GraphQLError, Source, DocumentNode, ExecutionResult } from 'graphql';

declare namespace FastifyGQL {

  export interface Plugin {
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
    defineLoaders(loaders: {[key: string]: Function}): void;
  }

  export interface Options<
    HttpServer,
    HttpRequest,
    HttpResponse
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
      [key: string]: Function
    },
    /**
     * Serve GraphiQL on /graphiql if true or 'graphiql', or GraphQL IDE on /playground if 'playground' if routes is true
     */
    graphiql?: boolean | string,
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
    errorHandler?: (
      error: FastifyError,
      request: FastifyRequest<HttpRequest>,
      reply: FastifyReply<HttpResponse>
    ) => ExecutionResult | boolean,
    /**
     * The maximum depth allowed for a single query.
     */
    queryDepth?: number
  }
}

declare module "fastify" {
  interface FastifyInstance<HttpServer, HttpRequest, HttpResponse> {
    /**
     * GraphQL plugin
     */
    graphql: FastifyGQL.Plugin;
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

declare const fastifyGQL: fastify.Plugin<
  Server,
  IncomingMessage,
  ServerResponse, 
  FastifyGQL.Options<Server, IncomingMessage, ServerResponse>
>;

export = fastifyGQL;