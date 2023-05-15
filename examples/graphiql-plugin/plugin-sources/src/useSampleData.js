import { useEffect, useState } from 'react'
import sampleDataManager from './sampleDataManager'

const useSampleData = () => {
  const [sampleData, setSampleData] = useState(
    sampleDataManager.getSampleData()
  )

  useEffect(() => {
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

export default useSampleData
