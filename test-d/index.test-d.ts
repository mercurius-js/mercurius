import {expectType} from 'tsd';
import fastify, {Plugin} from 'fastify';
import {makeExecutableSchema} from 'graphql-tools';
import * as fastifyGQL from '..';

import {Server, IncomingMessage, ServerResponse} from 'http';
import {Http2Server, Http2ServerRequest, Http2ServerResponse} from 'http2';

expectType<
  Plugin<
    Server,
    IncomingMessage,
    ServerResponse,
    fastifyGQL.Options<Server, IncomingMessage, ServerResponse>
  >
>(fastifyGQL);
expectType<
  Plugin<
    Http2Server,
    Http2ServerRequest,
    Http2ServerResponse,
    fastifyGQL.Options<Http2Server, Http2ServerRequest, Http2ServerResponse>
  >
>(fastifyGQL);

const app = fastify();

const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`;

const resolvers = {
  Query: {
    add: async (_: any, obj: {x: number; y: number}) => {
      const {x, y} = obj;
      return x + y;
    },
  },
};

app.register(fastifyGQL, {
  schema,
  resolvers,
  graphiql: true,
} as fastifyGQL.Options<Server, IncomingMessage, ServerResponse>);

expectType<fastifyGQL.Plugin>(app.graphql);

app.get('/', async (req, res) => {
  const schema = makeExecutableSchema({
    typeDefs: `
      type Foo {
        id: Int!
      }
    `,
    resolvers: {
      Foo: () => {},
    },
  });
  res.graphql(schema);
});
