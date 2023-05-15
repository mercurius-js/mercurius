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

export default sampleDataManager
