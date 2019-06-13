/**
 * Get field name from node
 * @param {FieldNode} node
 */
function getFieldName (node) {
  return node.alias ? node.alias.value : node.name.value
}

/**
 * Traverses Graphql selectionSet for fields that were requrested by client
 *
 * *Inputs:*
 * @param {GraphQLResolveInfo} info (see: https://tinyurl.com/y3wplolb)
 * @param {SelectionSetNode} selectionSet
 * *Results:*
 * @param {string[]} fields - fields requested by client
 * @param {{[relationName:string]: any;}} relations - relations that client includes
 */
const visitNodes = (info, selectionSet, fields, relations) => {
  for (const selection of selectionSet.selections) {
    if (selection.kind === 'Field') {
      const responseName = getFieldName(selection)
      if (selection.selectionSet) {
        relations[responseName] = []
        visitNodes(info, selection.selectionSet, relations[responseName], relations)
      } else {
        fields.push(responseName)
      }
    } else if (selection.kind === 'InlineFragment') {
      // @ts-ignore
      visitNodes(info, selection.selectionSet, fields, relations)
    } else if (selection.kind === 'FragmentSpread') {
      const fragment = info.fragments[selection.name.value]
      // @ts-ignore
      visitNodes(info, fragment.selectionSet, fields, relations)
    }
  }
}

/**
* Extracts fields that were requested in query. For example
*
* @param {GraphQLResolveInfo} info (see: https://tinyurl.com/y3wplolb)
* @return {{fields: string[], relations: {[relationName:string]: any;}}}
*
*  _Example output_:
*  ```js
*  {
*   fields:   [ 'key1', 'key2' ]
*   relations: {
*      parent: ['key1']
*   }
*  }
*  ```
*/
const getQueryFields = (info) => {
  const fieldNodes = info.fieldNodes
  if (fieldNodes || fieldNodes.length !== 0) {
    const fields = []
    const relations = {}
    visitNodes(info, fieldNodes[0].selectionSet, fields, relations)
    return {
      fields,
      relations
    }
  }
}

/**
 * Build query objects with additional helpers methods
 *
 * @param {GraphQLResolveInfo} info (see: https://tinyurl.com/y3wplolb)

 * @return { QueryObject }
 */
const buildQueryObject = (info) => {
  const fields = getQueryFields(info)
  const queryObject = {}
  // Needs separate typedef
  queryObject.hasRelations = () => {
    return fields.relations.keys() !== 0
  }
  queryObject.hasRelation = (name) => {
    return !!fields.relations[name]
  }
  /**
     * Returns root fields in format acceptable for most of the sql queries
     * @param separator - separates variables (default ,)
     */
  queryObject.getRootFields = (separator) => {
    if (!separator) {
      separator = ','
    }
    return fields.fields.map((field) => {
      return `${field}`
    }).join(separator)
  }
  /**
     * Returns relation fields in format acceptable for most of the sql queries.
     * Method works with PostgresDB, MySQL and any other database that supports
     * this syntax.
     *
     * @param mapper - argument that maps composite field to single one.
     * By default `as` for PostgreSQL. Use `on`for mysql.
     * @param separator - separates variables (default ,)
     */
  queryObject.getRelationFields = (relation, mapper, separator) => {
    if (fields.relations[relation]) {
      if (!mapper) {
        mapper = 'as'
      }
      if (!separator) {
        separator = ','
      }
      return fields.relations[relation].map((field) => {
        return `${field} ${mapper} ${relation}__${field}`
      }).join(separator)
    }
  }

  /**
   * Expands single key structure returned from database to graph that can
   * be returned by resolver. Method pics all fields that starts with relation name.
   * For example 'relation__field' and puts them into nested relation structure.
   */
  queryObject.expandToGraph = (data, relations) => {
    for (const relation of relations) {
      for (const element of data) {
        element[relation] = {}
        for (const key in element) {
          if (key.startsWith(`${relation}__`)) {
            const originalKey = key.replace(`${relation}__`, '')
            element[relation][originalKey] = element[key]
          }
        }
      }
    }
    return data
  }

  return Object.assign(fields, queryObject)
}

module.exports = {
  getQueryFields,
  buildQueryObject
}
