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

import * as graphMutations from "./graph-mutations"
import fromPairs from 'lodash.frompairs'
import { getReferencesToSubpatch, ReferencesToSubpatch } from './pdjson-helpers'
import { getSources, getSinks } from './graph-helpers'

export default (pd: PdJson.Pd): PdDspGraph.Graph => {
    const [graph, idTranslationMaps] = buildGraph(pd)    
    flattenGraph(pd, graph, idTranslationMaps)
    return graph
}

type IdTranslationMap = Readonly<{[nodeLocalId: string]: PdDspGraph.NodeId}>
export type IdTranslationMaps = Readonly<{[patchId: string]: IdTranslationMap}>

// Given the base structure of a `pd` object, convert the explicit connections into our graph format.
export const buildGraph = (pd: PdJson.Pd): [PdDspGraph.Graph, IdTranslationMaps] => {
    const graph: PdDspGraph.Graph = {}
    let idCounter = -1
    const nextNodeId = (): string => `${++idCounter}`

    const idTranslationMaps: IdTranslationMaps = fromPairs(
        Object.values(pd.patches).map((patch) => {
            const idTranslationMap: IdTranslationMap = fromPairs(
                Object.values(patch.nodes).map(patchNode => {
                    const graphNodeId = nextNodeId()
                    graphMutations.ensureNode(graph, graphNodeId, patchNode)
                    return [patchNode.id, graphNodeId]
                })
            )

            patch.connections.forEach(patchConnection => {
                const graphSourceNode = graph[idTranslationMap[patchConnection.source.id]]
                const graphSinkNode = graph[idTranslationMap[patchConnection.sink.id]]
                graphMutations.connect(
                    graph,
                    { 
                        id: graphSourceNode.id,
                        portlet: patchConnection.source.portlet,
                    },
                    { 
                        id: graphSinkNode.id,
                        portlet: patchConnection.sink.portlet,
                    },
                )
            })
            return [patch.id, idTranslationMap]
        })
    )
    return [graph, idTranslationMaps]
}

// Given a pd object, inline all the subpatches into the given `graph`, so that objects indirectly wired through 
// the [inlet] and [outlet] objects of a subpatch are instead directly wired into the same graph. Also, deletes
// [pd subpatch], [inlet] and [outlet] nodes (tilde or not).
export const flattenGraph = (pd: PdJson.Pd, graph: PdDspGraph.Graph, idTranslationMaps: IdTranslationMaps) => {
    const patchesToInline = new Set<PdJson.ObjectGlobalId>(Object.keys(pd.patches))
    while (patchesToInline.size) {
        patchesToInline.forEach(patchId => {
            const subpatch = pd.patches[patchId]
            const hasDependencies = Object.values(subpatch.nodes)
                .some(node => node.refId && patchesToInline.has(node.refId))
            if (hasDependencies) {
                return
            }
            _inlineSubpatch(pd, subpatch, graph, idTranslationMaps)
            patchesToInline.delete(subpatch.id)
        })
    }
}

// This inlines a subpatch in all the patches where it is defined.
// !!! This works only on one level. If the subpatch contains other subpatches they won't be inlined
export const _inlineSubpatch = (pd: PdJson.Pd, subpatch: PdJson.Patch, graph: PdDspGraph.Graph, idTranslationMaps: IdTranslationMaps) => {
    const subpatchReferences = getReferencesToSubpatch(pd, subpatch.id)
    _inlineSubpatchInlets(graph, subpatch, subpatchReferences, idTranslationMaps)
    _inlineSubpatchOutlets(graph, subpatch, subpatchReferences, idTranslationMaps)
    subpatchReferences.forEach(([outerPatchId, subpatchNodeId]) =>
        graphMutations.deleteNode(graph, idTranslationMaps[outerPatchId][subpatchNodeId])
    )
}

export const _inlineSubpatchInlets = (graph: PdDspGraph.Graph, subpatch: PdJson.Patch, referencesToSubpatch: ReferencesToSubpatch, idTranslationMaps: IdTranslationMaps) => {
    subpatch.inlets.forEach((inletNodeId: PdJson.ObjectLocalId, subpatchNodeInlet: PdJson.PortletId) => {
        inletNodeId = idTranslationMaps[subpatch.id][inletNodeId]
        // Sinks are nodes inside the subpatch which receive connections from the [inlet] object.
        const sinkAddresses = getSinks(graph, inletNodeId, 0)
        referencesToSubpatch.forEach(([outerPatchId, subpatchNodeId]) => {
            // Sources are nodes outside the subpatch, which are connected to the corresponding 
            // inlet of the [pd subpatch] object.
            const sourceAddresses = getSources(graph, idTranslationMaps[outerPatchId][subpatchNodeId], subpatchNodeInlet)
            sourceAddresses.forEach(sourceAddress => 
                sinkAddresses.forEach(sinkAddress => graphMutations.connect(graph, sourceAddress, sinkAddress))
            )
        })
        graphMutations.deleteNode(graph, inletNodeId)
    })
}

export const _inlineSubpatchOutlets = (graph: PdDspGraph.Graph, subpatch: PdJson.Patch, referencesToSubpatch: ReferencesToSubpatch, idTranslationMaps: IdTranslationMaps) => {
    subpatch.outlets.forEach((outletNodeId: PdJson.ObjectLocalId, subpatchNodeOutlet: PdJson.PortletId) => {
        outletNodeId = idTranslationMaps[subpatch.id][outletNodeId]
        // Sources are nodes inside the subpatch which are connected to the [outlet] object.
        const sourceAddresses = getSources(graph, outletNodeId, 0)
        referencesToSubpatch.forEach(([outerPatchId, subpatchNodeId]) => {
            // Sinks are nodes outside the subpatch, which receive connection from the corresponding 
            // outlet of the [pd subpatch] object.
            const sinkAddresses = getSinks(graph, idTranslationMaps[outerPatchId][subpatchNodeId], subpatchNodeOutlet)
            sourceAddresses.forEach(sourceAddress => 
                sinkAddresses.forEach(sinkAddress => graphMutations.connect(graph, sourceAddress, sinkAddress))
            )
        })
        graphMutations.deleteNode(graph, outletNodeId)
    })
}
