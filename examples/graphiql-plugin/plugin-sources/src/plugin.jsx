import React from 'react'
import useSampleData from './useSampleData'

export function Content () {
  const { sampleData } = useSampleData()

  return (
    <div style={{ maxWidth: '300px' }}>
      <div style={{ height: '100%' }}>This is a sample plugin</div>
      {sampleData && <pre>{JSON.stringify(sampleData, null, 2)}</pre>}
    </div>
  )
}

export function Icon () {
  return <p>GE</p>
}

export function graphiqlSamplePlugin (props) {
  return {
    title: props.title || 'GraphiQL Sample',
    icon: () => <Icon />,
    content: () => {
      return <Content />
    }
  }
}

export function umdPlugin (props) {
  return graphiqlSamplePlugin(props)
}
