// @ts-check

/**
 * Imports:
 * @typedef {import('graphql').FieldNode} FieldNode
 * @typedef {import('graphql').GraphQLResolveInfo} GraphQLResolveInfo
 * @typedef {import('graphql').SelectionSetNode} SelectionSetNode
 * @typedef {Object<string, any>} QueryObject
 */

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
     * @param wrapper - wraps variable name (default ")
     * @param separator - separates variables (default ,)
     */
  queryObject.getRootFields = (wrapper, separator) => {
    if (!wrapper) {
      wrapper = '"'
    }
    if (!separator) {
      separator = ','
    }
    return fields.fields.map((field) => {
      return `${wrapper}${field}${wrapper}`
    }).join(separator)
  }
  /**
     * Returns relation fields in format acceptable for most of the sql queries
     *
     * @param wrapper - wraps variable name (default ")
     * @param separator - separates variables (default ,)
     */
  queryObject.getRelationFields = (relation, wrapper, separator) => {
    if (fields.relations[relation]) {
      if (!wrapper) {
        wrapper = '"'
      }
      if (!separator) {
        separator = ','
      }
      return fields.relations[relation].map((field) => {
        return `${wrapper}${field}${wrapper}`
      }).join(separator)
    }
    return ''
  }

  return Object.assign(fields, queryObject)
}

module.exports = {
  getQueryFields,
  buildQueryObject
}
