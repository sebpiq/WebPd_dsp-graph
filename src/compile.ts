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
import { getSource, getSinks, portletAddressesEqual } from './graph-helpers'
import partition from 'lodash.partition'
import { Compilation } from './compilation'

// export default (pd: PdJson.Pd): PdDspGraph.Graph => {
//     const compilation = new Compilation(pd)
//     buildGraph(compilation)
//     flattenGraph(compilation)
//     return compilation.graph
// }

// Given the base structure of a `pd` object, convert the explicit connections into our graph format.
export const buildGraph = (compilation: Compilation): void => {
    const { pd, graph } = compilation

    Object.values(pd.patches).forEach((patch) => {
        Object.values(patch.nodes).forEach((pdNode) => {
            const graphNodeId = compilation.buildGraphNodeId(
                patch.id,
                pdNode.id
            )
            graphMutations.ensureNode(graph, graphNodeId, pdNode)
        })

        // Convert pd patch connections to couples [sourceAddress, sinkAddress]
        // representing connections in the graph.
        let allConnections = patch.connections.map((patchConnection) => [
            {
                id: compilation.buildGraphNodeId(
                    patch.id,
                    patchConnection.source.id
                ),
                portlet: patchConnection.source.portlet,
            },
            {
                id: compilation.buildGraphNodeId(
                    patch.id,
                    patchConnection.sink.id
                ),
                portlet: patchConnection.sink.portlet,
            },
        ])

        // Since our graph format only supports a unique source for each sink,
        // we have to collect multiple connections to the same sink in order
        // to resolve them.
        while (allConnections.length) {
            const [, sinkAddress] = allConnections[0]
            let connectionsToSinkAddress: typeof allConnections
            ;[
                connectionsToSinkAddress,
                allConnections,
            ] = partition(allConnections, ([, otherSinkAddress]) =>
                portletAddressesEqual(sinkAddress, otherSinkAddress)
            )

            _buildGraphConnections(
                compilation,
                connectionsToSinkAddress.map(
                    ([sourceAddress]) => sourceAddress
                ),
                sinkAddress
            )
        }
    })
}

const _buildGraphConnections = (
    compilation: Compilation,
    sourceAddresses: Array<PdDspGraph.PortletAddress>,
    sinkAddress: PdDspGraph.PortletAddress
): void => {
    const { graph } = compilation
    if (sourceAddresses.length === 1) {
        graphMutations.connect(graph, sourceAddresses[0], sinkAddress)
        return
    }

    // Create Mixer node according to sink type
    let mixerNode: PdDspGraph.Node
    const sinkType = compilation.getSinkType(sinkAddress)
    if (sinkType === 'control') {
        mixerNode = graphMutations.addNode(compilation.graph, {
            id: compilation.buildMixerNodeId(sinkAddress),
            type: 'trigger',
            sinks: {},
            sources: {},
        })
    } else if (sinkType === 'signal') {
        mixerNode = graphMutations.addNode(compilation.graph, {
            id: compilation.buildMixerNodeId(sinkAddress),
            type: '+~',
            sinks: {},
            sources: {},
        })
    } else {
        throw new Error(`unexpected PdJson.PortletType ${sinkType}`)
    }

    // Connect all sources to mixer, and mixed output to sink
    sourceAddresses.forEach((sourceAddress, inlet) => {
        graphMutations.connect(graph, sourceAddress, {
            id: mixerNode.id,
            portlet: inlet,
        })
    })
    graphMutations.connect(graph, { id: mixerNode.id, portlet: 0 }, sinkAddress)
}

// Given a pd object, inline all the subpatches into the given `graph`, so that objects indirectly wired through
// the [inlet] and [outlet] objects of a subpatch are instead directly wired into the same graph. Also, deletes
// [pd subpatch], [inlet] and [outlet] nodes (tilde or not).
export const flattenGraph = (compilation: Compilation): void => {
    const { pd } = compilation
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
            _inlineSubpatch(compilation, subpatch)
            patchesToInline.delete(subpatch.id)
        })
    }
}

// This inlines a subpatch in all the patches where it is defined.
// !!! This works only on one level. If the subpatch contains other subpatches they won't be inlined
export const _inlineSubpatch = (
    compilation: Compilation,
    subpatch: PdJson.Patch
): void => {
    const { pd, graph } = compilation
    const subpatchReferences = getReferencesToSubpatch(pd, subpatch.id)
    _inlineSubpatchInlets(compilation, subpatch, subpatchReferences)
    _inlineSubpatchOutlets(compilation, subpatch, subpatchReferences)
    subpatchReferences.forEach(([outerPatchId, subpatchPdNodeId]) =>
        graphMutations.deleteNode(
            graph,
            compilation.buildGraphNodeId(outerPatchId, subpatchPdNodeId)
        )
    )
}

export const _inlineSubpatchInlets = (
    compilation: Compilation,
    subpatch: PdJson.Patch,
    referencesToSubpatch: ReferencesToSubpatch
): void => {
    const { graph } = compilation
    subpatch.inlets.forEach(
        (
            inletPdNodeId: PdJson.ObjectLocalId,
            subpatchNodeInlet: PdJson.PortletId
        ) => {
            const inletNodeId = compilation.buildGraphNodeId(
                subpatch.id,
                inletPdNodeId
            )

            // Sinks are nodes inside the subpatch which receive connections from the [inlet] object.
            const sinkAddresses = getSinks(graph, inletNodeId, 0)
            referencesToSubpatch.forEach(([outerPatchId, subpatchPdNodeId]) => {
                // Sources are nodes outside the subpatch, which are connected to the corresponding
                // inlet of the [pd subpatch] object.
                const sourceAddress = getSource(
                    graph,
                    compilation.buildGraphNodeId(
                        outerPatchId,
                        subpatchPdNodeId
                    ),
                    subpatchNodeInlet
                )
                if (!sourceAddress) {
                    return
                }
                sinkAddresses.forEach((sinkAddress) =>
                    graphMutations.connect(graph, sourceAddress, sinkAddress)
                )
            })
            graphMutations.deleteNode(graph, inletNodeId)
        }
    )
}

export const _inlineSubpatchOutlets = (
    compilation: Compilation,
    subpatch: PdJson.Patch,
    referencesToSubpatch: ReferencesToSubpatch
): void => {
    const { graph } = compilation
    subpatch.outlets.forEach(
        (
            outletPdNodeId: PdJson.ObjectLocalId,
            subpatchNodeOutlet: PdJson.PortletId
        ) => {
            const outletNodeId = compilation.buildGraphNodeId(
                subpatch.id,
                outletPdNodeId
            )

            // Sources are nodes inside the subpatch which are connected to the [outlet] object.
            const sourceAddress = getSource(graph, outletNodeId, 0)
            if (sourceAddress) {
                referencesToSubpatch.forEach(
                    ([outerPatchId, subpatchPdNodeId]) => {
                        // Sinks are nodes outside the subpatch, which receive connection from the corresponding
                        // outlet of the [pd subpatch] object.
                        const sinkAddresses = getSinks(
                            graph,
                            compilation.buildGraphNodeId(
                                outerPatchId,
                                subpatchPdNodeId
                            ),
                            subpatchNodeOutlet
                        )
                        sinkAddresses.forEach((sinkAddress) =>
                            graphMutations.connect(
                                graph,
                                sourceAddress,
                                sinkAddress
                            )
                        )
                    }
                )
            }

            graphMutations.deleteNode(graph, outletNodeId)
        }
    )
}
