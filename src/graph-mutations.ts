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
import remove from 'lodash.remove'

export const ensureNode = (
    graph: PdDspGraph.Graph,
    nodeId: PdDspGraph.NodeId,
    jsonNode: PdJson.Node
): PdDspGraph.Node => {
    if (!graph[nodeId]) {
        graph[nodeId] = {
            id: nodeId,
            proto: jsonNode.proto,
            sinks: [],
            sources: [],
        }
    }
    return graph[nodeId]
}

export const connect = (
    graph: PdDspGraph.Graph,
    sourceAddress: PdDspGraph.PortletAddress,
    sinkAddress: PdDspGraph.PortletAddress
): void => {
    const source = graph[sourceAddress.id]
    const sink = graph[sinkAddress.id]
    const connection = {
        source: sourceAddress,
        sink: sinkAddress,
    }
    // Avoid duplicate connections : we check only once,
    // because we assume that connections are always consistent on both sides.
    if (
        !source.sinks.some((otherConnection) =>
            _connectionsEqual(connection, otherConnection)
        )
    ) {
        source.sinks.push(connection)
        sink.sources.push(connection)
    }
}

export const disconnectNodes = (
    graph: PdDspGraph.Graph,
    sourceNodeId: PdDspGraph.NodeId,
    sinkNodeId: PdDspGraph.NodeId
): void => {
    if (!graph[sourceNodeId] || !graph[sourceNodeId]) {
        throw new Error(
            `both '${sourceNodeId}' and '${sinkNodeId}' must exist in graph`
        )
    }
    const sourceNode = graph[sourceNodeId]
    const sinkNode = graph[sinkNodeId]
    remove(sourceNode.sinks, ({ sink }) => sink.id === sinkNodeId)
    remove(sinkNode.sources, ({ source }) => source.id === sourceNodeId)
}

export const deleteNode = (
    graph: PdDspGraph.Graph,
    nodeId: PdDspGraph.NodeId
): void => {
    const node = graph[nodeId]
    if (!node) {
        return
    }
    // `slice` is required here because we change the list while iterating
    node.sources
        .slice(0)
        .forEach((connection) =>
            disconnectNodes(graph, connection.source.id, nodeId)
        )
    node.sinks.slice(0).forEach((connection) => {
        disconnectNodes(graph, nodeId, connection.sink.id)
    })
    delete graph[nodeId]
}

const _connectionsEqual = (
    c1: PdDspGraph.Connection,
    c2: PdDspGraph.Connection
): boolean =>
    c1.sink.portlet === c2.sink.portlet &&
    c1.sink.id === c2.sink.id &&
    c1.source.portlet === c2.source.portlet &&
    c1.source.id === c2.source.id
