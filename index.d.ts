import { FastifyError, FastifyReply, FastifyRequest, FastifyInstance, RawServerBase, RawRequestDefaultExpression, RawReplyDefaultExpression, } from "fastify";
import { DocumentNode, ExecutionResult, GraphQLSchema, Source } from 'graphql';
import { IResolvers } from "graphql-tools";

declare namespace fastifyGQL {

  export interface Plugin {
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
            reply: FastifyReply
          }) => any
      }
    }): void;
  }

  export interface Options {
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
            reply: FastifyReply
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
      request: FastifyRequest,
      reply: FastifyReply
    ) => ExecutionResult),
    /**
     * The maximum depth allowed for a single query.
     */
    queryDepth?: number,
    context?: (request: FastifyRequest, reply: FastifyReply) => Promise<any>,
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
  }

  /**
   * Extended errors for adding additional information in error responses
   */
  export class ErrorWithProps extends Error {
    constructor (message: string, code?: string, additionalProperties?: object)
    /**
     * Custom error code of this error
     */
    code?: string
    /**
     * Custom additional properties of this error
     */
    additionalProperties?: object
  } 
}

declare module "fastify" {
  interface FastifyInstance {
    /**
     * GraphQL plugin
     */
    graphql: fastifyGQL.Plugin;
  }

  interface FastifyReplyInterface {
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

declare function fastifyGQL(
  instance: FastifyInstance<RawServerBase, RawRequestDefaultExpression<RawServerBase>, RawReplyDefaultExpression<RawServerBase>>,
  opts: fastifyGQL.Options): void


export = fastifyGQL;
