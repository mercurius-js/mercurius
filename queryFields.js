const filters = {
    /**
     * Extracts fields that were requested in query in following format:
     * [ 'key1', 'key2' ]
     */
    getQueryFields: (info) => {
        const fieldNodes = info.fieldNodes;
        if (fieldNodes || fieldNodes.length !== 0) {
            const fields = fieldNodes[0].selectionSet.selections
                // remove relationships as they will be queried separately
                .filter((element => !element.selectionSet))
                .map(({ name: { value } }) => {
                    return value;
                });
            return fields;
        }
    }
}

module.exports = filters;