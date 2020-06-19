/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

export type ReferencesToSubpatch = Array<
    [PdJson.ObjectGlobalId, PdJson.ObjectLocalId]
>

export const getReferencesToSubpatch = (
    pd: PdJson.Pd,
    refId: PdJson.ObjectGlobalId
): ReferencesToSubpatch => {
    return Object.values(pd.patches).reduce((allReferences, patch) => {
        const nodes: ReferencesToSubpatch = Object.values(patch.nodes)
            .filter((node) => node.refId === refId)
            .map((node) => [patch.id, node.id])
        if (nodes.length === 0) {
            return allReferences
        }
        return [...allReferences, ...nodes]
    }, [] as ReferencesToSubpatch)
}
