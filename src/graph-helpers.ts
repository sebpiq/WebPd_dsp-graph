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

export const portletAddressesEqual = (
    a1: PdDspGraph.PortletAddress,
    a2: PdDspGraph.PortletAddress
): boolean => a1.portlet === a2.portlet && a1.id === a2.id

export const testGraphIntegrity = (graph: PdDspGraph.Graph) => {
    const inconsistentConnections: Array<[
        PdDspGraph.PortletAddress,
        PdDspGraph.PortletAddress
    ]> = []

    Object.keys(graph).forEach((nodeId) => {
        // For each source, we check that the corresponding node declares the equivalent sink
        mapNodeSources(graph, nodeId, (sourceAddress, sinkAddress) => {
            const sinks = getSinks(
                graph,
                sourceAddress.id,
                sourceAddress.portlet
            )
            const matchedSink = sinks.filter((otherSinkAddress) =>
                portletAddressesEqual(otherSinkAddress, sinkAddress)
            )[0]
            if (!matchedSink) {
                inconsistentConnections.push([sourceAddress, sinkAddress])
            }
        })

        // For each sink, we check that the corresponding node declares the equivalent source
        mapNodeSinks(graph, nodeId, (sinkAddress, sourceAddress) => {
            const matchedSource = getSource(
                graph,
                sinkAddress.id,
                sinkAddress.portlet
            )
            if (!matchedSource) {
                inconsistentConnections.push([sourceAddress, sinkAddress])
            }
        })
    })

    if (inconsistentConnections.length) {
        return { inconsistentConnections }
    }
    return null
}

export const getNode = (graph: PdDspGraph.Graph, nodeId: PdDspGraph.NodeId) => {
    if (!graph[nodeId]) {
        throw new Error(`Node "${nodeId}" not found in graph`)
    }
    return graph[nodeId]
}

export const getSinks = (
    graph: PdDspGraph.Graph,
    nodeId: PdDspGraph.NodeId,
    outlet: PdDspGraph.PortletId
): Array<PdDspGraph.PortletAddress> =>
    getNode(graph, nodeId).sinks[outlet] || []

export const getSource = (
    graph: PdDspGraph.Graph,
    nodeId: PdDspGraph.NodeId,
    inlet: PdDspGraph.PortletId
): PdDspGraph.PortletAddress | undefined =>
    getNode(graph, nodeId).sources[inlet]

export const mapNodeSources = <T>(
    graph: PdDspGraph.Graph,
    nodeId: PdDspGraph.NodeId,
    callback: (
        sourceAddress: PdDspGraph.PortletAddress,
        sinkAddress: PdDspGraph.PortletAddress
    ) => T
) => {
    const node = getNode(graph, nodeId)
    return Object.entries(node.sources).map(([inlet, sourceAddress]) =>
        callback(sourceAddress, { id: nodeId, portlet: parseInt(inlet, 10) })
    )
}

export const mapNodeSinks = <T>(
    graph: PdDspGraph.Graph,
    nodeId: PdDspGraph.NodeId,
    callback: (
        sourceAddress: PdDspGraph.PortletAddress,
        sinkAddress: PdDspGraph.PortletAddress
    ) => T
) => {
    const node = getNode(graph, nodeId)
    return Object.entries(node.sinks).reduce(
        (previousResults, [outlet, sinkAddresses]) => {
            return [
                ...previousResults,
                ...sinkAddresses.map((sinkAddress) =>
                    callback(sinkAddress, {
                        id: nodeId,
                        portlet: parseInt(outlet, 10),
                    })
                ),
            ]
        },
        [] as Array<T>
    )
}
