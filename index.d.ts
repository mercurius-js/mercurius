/// <reference types="node" />

import fastify, {
  FastifyError,
  FastifyReply,
  FastifyRequest,
  Plugin,
  RegisterOptions,
} from 'fastify';
import {Server, IncomingMessage, ServerResponse} from 'http';
import {Http2Server, Http2ServerRequest, Http2ServerResponse} from 'http2';
import {IResolvers} from 'graphql-tools';
import graphql, {DocumentNode, Source, GraphQLSchema} from 'graphql';

declare namespace fastifyGQL {
  /**
   * Plugin interface
   */
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

  /**
   * Plugin options
   */
  export interface Options<
    HttpServer extends Server | Http2Server,
    HttpRequest extends IncomingMessage | Http2ServerRequest,
    HttpResponse extends ServerResponse | Http2ServerResponse
  > extends RegisterOptions<HttpServer, HttpRequest, HttpResponse> {
    /**
     * String or schema definition. The graphql schema. The string will be parsed.
     */
    schema: GraphQLSchema | string;
    /**
     * The graphql resolvers.
     */
    resolvers: IResolvers;
    /**
     *
     */
    loaders: {[key: string]: Function};
    /**
     * Serve GraphiQL on /graphiql if routes is true.
     * @default true
     */
    graphiql?: boolean;
    /**
     * The minimum number of execution a query needs to be executed before being jit'ed.
     */
    jit?: number;
    /**
     * Serves the Default: true. A graphql endpoint is exposed at /graphql
     * @default true
     */
    routes?: boolean;
    /**
     * Change the route prefix of the graphql endpoint if enabled.
     */
    prefix?: string;
    /**
     * Add the empty Mutation definition if schema is not defined
     * @default false
     */
    defineMutation?: boolean;
    /**
     * Change the default error handler
     * @default true
     */
    errorHandler: (
      error: FastifyError,
      request: FastifyRequest<HttpRequest>,
      reply: FastifyReply<HttpResponse>
    ) => void | boolean;
  }
}

declare module 'fastify' {
  interface FastifyInstance<HttpServer, HttpRequest, HttpResponse> {
    /**
     * GraphQL plugin
     */
    graphql: fastifyGQL.Plugin;
  }

  interface FastifyReply<HttpResponse> {
    /**
     * @param schema GraphQL schema
     * @param context request context
     * @param variables request variables which will get passed to the executor
     * @param operationName specify which operation will be run
     */
    graphql(
      schema: GraphQLSchema,
      context?: any,
      variables?: {[key: string]: any},
      operationName?: string
    ): void;
  }
}

declare function fastifyGQL<
  HttpServer extends Server | Http2Server,
  HttpRequest extends IncomingMessage | Http2ServerRequest,
  HttpResponse extends ServerResponse | Http2ServerResponse,
  Options = fastifyGQL.Options<HttpServer, HttpRequest, HttpResponse>
>(): void;

export = fastifyGQL;
