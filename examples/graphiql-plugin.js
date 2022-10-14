'use strict'

const Fastify = require('fastify')
const mercurius = require('..')

const app = Fastify()

const pluginSrc = `
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('react')) :
  typeof define === 'function' && define.amd ? define(['exports', 'react'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.samplePlugin = {}, global.React));
})(this, (function (exports, React) { 'use strict';
  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }
  var React__default = /*#__PURE__*/_interopDefaultLegacy(React);
  class SampleDataManager extends EventTarget {
    constructor() { super(); this.sampleData = []; }
    getExplainData() { return this.sampleData }
    setExplain(sampleData) { this.sampleData = sampleData || []; this.dispatchEvent(new Event('updateSampleData')); }
  }

  const sampleDataManager = new SampleDataManager();
  const useSampleData = () => {
    const [sampleData, setSampleData] = React.useState(sampleDataManager.getExplainData());
    React.useEffect(() => {
      const eventListener = sampleDataManager.addEventListener(
        'updateSampleData', (e, value) => {setSampleData(_ => e.target.sampleData || []);});
      return () => {sampleDataManager.removeEventListener('updateSampleData', eventListener);}
    }, []);
    return {sampleData}
  };

  function Content() {
    const { sampleData } = useSampleData();
    return (
      React__default["default"].createElement('div', {style: { maxWidth: '300px'}}, [
        React__default["default"].createElement('div', {style: { height: '100%'}}, ["This is a sample plugin"]),
        sampleData && React__default["default"].createElement('pre', null, [JSON.stringify(sampleData, null, 2)])
      ]))}

  function Icon() {return React__default["default"].createElement('p', {style: { width: '100%', display: 'flex', justifyContent: 'center'}}, ["P"])}
  function graphiqlSamplePlugin() {return umdPlugin()}
  
  /*
   * The plugin should have \`umdPlugin\` function that exports:
   *   title: string. The title of the plugin
   *   icon: React component. The icon shown in the toolbar
   *   content: React component.
   */  
  function umdPlugin() {
    return { 
      title: 'GraphiQL Sample',
      icon: () => Icon(),
      content: () => { return Content() }
    }
  }

  /*
   * A function to intercept the fetch data can be exported to allow access to the data.
   * Graphiql do not provide an easy way to access the retrieved data.
   */  
  function parseFetchResponse(data) {
    if (data.data) {sampleDataManager.setExplain(data.data);} // Do something with the data
    return data // It should return the data
  }
  exports.graphiqlSamplePlugin = graphiqlSamplePlugin;
  exports.parseFetchResponse = parseFetchResponse;
  exports.umdPlugin = umdPlugin;
  Object.defineProperty(exports, '__esModule', { value: true });
}));
`

const schema = `
  type Query {
    add(x: Int, y: Int): Int
  }
`

const resolvers = {
  Query: {
    add: async (_, obj) => {
      const { x, y } = obj
      return x + y
    }
  }
}

app.register(mercurius, {
  schema,
  resolvers,
  graphiql: {
    enabled: true,
    plugins: [
      {
        name: 'samplePlugin',
        props: {},
        umdUrl: 'http://localhost:3000/graphiql/sample.js',
        fetcherWrapper: 'parseFetchResponse'
      }
    ]
  }
})

app.get('/', async function (req, reply) {
  const query = '{ add(x: 2, y: 2) }'
  return reply.graphql(query)
})

app.get('/graphiql/sample.js', (req, reply) => {
  reply
    .header('Content-Type', 'application/javascript')
    .send(pluginSrc)
})

app.listen({ port: 3000 })
