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

import * as graphMutations from './graph-mutations'
import { getReferencesToSubpatch, ReferencesToSubpatch } from './pdjson-helpers'
import { getSources, getSinks } from './graph-helpers'

export default (pd: PdJson.Pd): PdDspGraph.Graph => {
    const graph = buildGraph(pd)
    flattenGraph(pd, graph)
    return graph
}

export const buildGraphNodeId = (
    patchId: PdJson.ObjectGlobalId,
    nodeId: PdJson.ObjectLocalId
): PdDspGraph.NodeId => `${patchId}:${nodeId}`

// Given the base structure of a `pd` object, convert the explicit connections into our graph format.
export const buildGraph = (pd: PdJson.Pd): PdDspGraph.Graph => {
    const graph: PdDspGraph.Graph = {}

    Object.values(pd.patches).forEach((patch) => {
        Object.values(patch.nodes).forEach((pdNode) => {
            const graphNodeId = buildGraphNodeId(patch.id, pdNode.id)
            graphMutations.ensureNode(graph, graphNodeId, pdNode)
        })

        patch.connections.forEach((patchConnection) => {
            const graphSourceNodeId = buildGraphNodeId(
                patch.id,
                patchConnection.source.id
            )
            const graphSinkNodeId = buildGraphNodeId(
                patch.id,
                patchConnection.sink.id
            )
            graphMutations.connect(
                graph,
                {
                    id: graphSourceNodeId,
                    portlet: patchConnection.source.portlet,
                },
                {
                    id: graphSinkNodeId,
                    portlet: patchConnection.sink.portlet,
                }
            )
        })
    })
    return graph
}

// Given a pd object, inline all the subpatches into the given `graph`, so that objects indirectly wired through
// the [inlet] and [outlet] objects of a subpatch are instead directly wired into the same graph. Also, deletes
// [pd subpatch], [inlet] and [outlet] nodes (tilde or not).
export const flattenGraph = (pd: PdJson.Pd, graph: PdDspGraph.Graph): void => {
    const patchesToInline = new Set<PdJson.ObjectGlobalId>(
        Object.keys(pd.patches)
    )
    while (patchesToInline.size) {
        patchesToInline.forEach((patchId) => {
            const subpatch = pd.patches[patchId]
            const hasDependencies = Object.values(subpatch.nodes).some(
                (node) => node.refId && patchesToInline.has(node.refId)
            )
            if (hasDependencies) {
                return
            }
            _inlineSubpatch(pd, subpatch, graph)
            patchesToInline.delete(subpatch.id)
        })
    }
}

// This inlines a subpatch in all the patches where it is defined.
// !!! This works only on one level. If the subpatch contains other subpatches they won't be inlined
export const _inlineSubpatch = (
    pd: PdJson.Pd,
    subpatch: PdJson.Patch,
    graph: PdDspGraph.Graph
): void => {
    const subpatchReferences = getReferencesToSubpatch(pd, subpatch.id)
    _inlineSubpatchInlets(graph, subpatch, subpatchReferences)
    _inlineSubpatchOutlets(graph, subpatch, subpatchReferences)
    subpatchReferences.forEach(([outerPatchId, subpatchNodeId]) =>
        graphMutations.deleteNode(
            graph,
            buildGraphNodeId(outerPatchId, subpatchNodeId)
        )
    )
}

export const _inlineSubpatchInlets = (
    graph: PdDspGraph.Graph,
    subpatch: PdJson.Patch,
    referencesToSubpatch: ReferencesToSubpatch
): void => {
    subpatch.inlets.forEach(
        (
            inletNodeId: PdJson.ObjectLocalId,
            subpatchNodeInlet: PdJson.PortletId
        ) => {
            inletNodeId = buildGraphNodeId(subpatch.id, inletNodeId)
            // Sinks are nodes inside the subpatch which receive connections from the [inlet] object.
            const sinkAddresses = getSinks(graph, inletNodeId, 0)
            referencesToSubpatch.forEach(([outerPatchId, subpatchNodeId]) => {
                // Sources are nodes outside the subpatch, which are connected to the corresponding
                // inlet of the [pd subpatch] object.
                const sourceAddresses = getSources(
                    graph,
                    buildGraphNodeId(outerPatchId, subpatchNodeId),
                    subpatchNodeInlet
                )
                sourceAddresses.forEach((sourceAddress) =>
                    sinkAddresses.forEach((sinkAddress) =>
                        graphMutations.connect(
                            graph,
                            sourceAddress,
                            sinkAddress
                        )
                    )
                )
            })
            graphMutations.deleteNode(graph, inletNodeId)
        }
    )
}

export const _inlineSubpatchOutlets = (
    graph: PdDspGraph.Graph,
    subpatch: PdJson.Patch,
    referencesToSubpatch: ReferencesToSubpatch
): void => {
    subpatch.outlets.forEach(
        (
            outletNodeId: PdJson.ObjectLocalId,
            subpatchNodeOutlet: PdJson.PortletId
        ) => {
            outletNodeId = buildGraphNodeId(subpatch.id, outletNodeId)
            // Sources are nodes inside the subpatch which are connected to the [outlet] object.
            const sourceAddresses = getSources(graph, outletNodeId, 0)
            referencesToSubpatch.forEach(([outerPatchId, subpatchNodeId]) => {
                // Sinks are nodes outside the subpatch, which receive connection from the corresponding
                // outlet of the [pd subpatch] object.
                const sinkAddresses = getSinks(
                    graph,
                    buildGraphNodeId(outerPatchId, subpatchNodeId),
                    subpatchNodeOutlet
                )
                sourceAddresses.forEach((sourceAddress) =>
                    sinkAddresses.forEach((sinkAddress) =>
                        graphMutations.connect(
                            graph,
                            sourceAddress,
                            sinkAddress
                        )
                    )
                )
            })
            graphMutations.deleteNode(graph, outletNodeId)
        }
    )
}
