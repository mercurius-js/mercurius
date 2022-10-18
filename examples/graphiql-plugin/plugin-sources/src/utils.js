import sampleDataManager from './sampleDataManager'

/**
 * Intercept and store the data fetched by GQL in the DataManager.
 */
export function parseFetchResponse (data) {
  if (data.data) {
    sampleDataManager.setSampleData(data.data)
  }
  return data
}
