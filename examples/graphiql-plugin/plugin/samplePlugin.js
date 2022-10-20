/* eslint-disable */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined'
    ? factory(exports, require('react'))
    : typeof define === 'function' && define.amd
      ? define(['exports', 'react'], factory)
      : (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.samplePlugin = {}, global.React))
})(this, function (exports, React) {
  'use strict'

  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { default: e } }

  const React__default = /* #__PURE__ */_interopDefaultLegacy(React)

  /**
   * A data manager to collect the data.
   */
  class SampleDataManager extends EventTarget {
    constructor () {
      super()
      this.sampleData = []
    }

    getSampleData () {
      return this.sampleData
    }

    setSampleData (sampleData) {
      this.sampleData = sampleData || []
      this.dispatchEvent(new Event('updateSampleData'))
    }
  }

  const sampleDataManager = new SampleDataManager()

  const useSampleData = () => {
    const [sampleData, setSampleData] = React.useState(
      sampleDataManager.getSampleData()
    )

    React.useEffect(() => {
      const eventListener = sampleDataManager.addEventListener(
        'updateSampleData',
        (e, value) => {
          setSampleData(_ => e.target.sampleData || [])
        }
      )
      return () => {
        sampleDataManager.removeEventListener('updateSampleData', eventListener)
      }
    }, [])

    return {
      sampleData
    }
  }

  function Content () {
    const { sampleData } = useSampleData()

    return (
      React__default.default.createElement('div', { style: { maxWidth: '300px' } }, [
        React__default.default.createElement('div', { style: { height: '100%' } }, ['This is a sample plugin']),
        sampleData && React__default.default.createElement('pre', null, [JSON.stringify(sampleData, null, 2)])
      ])
    )
  }

  function Icon () {
    return React__default.default.createElement('p', null, ['GE'])
  }

  function graphiqlSamplePlugin (props) {
    return {
      title: props.title || 'GraphiQL Sample',
      icon: () => Icon(),
      content: () => {
        return Content()
      }
    }
  }

  function umdPlugin (props) {
    return graphiqlSamplePlugin(props)
  }

  /**
   * Intercept and store the data fetched by GQL in the DataManager.
   */
  function parseFetchResponse (data) {
    if (data.data) {
      sampleDataManager.setSampleData(data.data)
    }
    return data
  }

  exports.graphiqlSamplePlugin = graphiqlSamplePlugin
  exports.parseFetchResponse = parseFetchResponse
  exports.umdPlugin = umdPlugin

  Object.defineProperty(exports, '__esModule', { value: true })
})
