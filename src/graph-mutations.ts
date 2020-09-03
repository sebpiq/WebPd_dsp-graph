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
import { getSinks, portletAddressesEqual, getNode } from './graph-helpers'

export const addNode = (
    graph: PdDspGraph.Graph,
    node: PdDspGraph.Node
): PdDspGraph.Node => {
    if (!graph[node.id]) {
        graph[node.id] = node
    }
    return node
}

export const ensureNode = (
    graph: PdDspGraph.Graph,
    nodeId: PdDspGraph.NodeId,
    jsonNode: PdJson.Node
): PdDspGraph.Node => {
    if (!graph[nodeId]) {
        graph[nodeId] = {
            id: nodeId,
            proto: jsonNode.proto,
            sinks: {},
            sources: {},
        }
    }
    return graph[nodeId]
}

export const connect = (
    graph: PdDspGraph.Graph,
    sourceAddress: PdDspGraph.PortletAddress,
    sinkAddress: PdDspGraph.PortletAddress
): void => {
    const sinkNode = getNode(graph, sinkAddress.id)
    getNode(graph, sourceAddress.id)
    // Avoid duplicate connections : we check only on sinks,
    // because we assume that connections are always consistent on both sides.
    if (
        !getSinks(
            graph,
            sourceAddress.id,
            sourceAddress.portlet
        ).some((otherSinkAddress) =>
            portletAddressesEqual(sinkAddress, otherSinkAddress)
        )
    ) {
        sinkNode.sources[sinkAddress.portlet] = sourceAddress
        _ensurePortletAddressArray(
            graph[sourceAddress.id].sinks,
            sourceAddress.portlet
        ).push(sinkAddress)
    }
}

export const disconnect = (
    graph: PdDspGraph.Graph,
    sourceAddress: PdDspGraph.PortletAddress,
    sinkAddress: PdDspGraph.PortletAddress
): void => {
    const sinkNode = getNode(graph, sinkAddress.id)
    delete sinkNode.sources[sinkAddress.portlet]

    const sinkAddresses = getSinks(
        graph,
        sourceAddress.id,
        sourceAddress.portlet
    )
    remove(sinkAddresses, (otherSinkAddress) =>
        portletAddressesEqual(sinkAddress, otherSinkAddress)
    )
}

export const disconnectNodes = (
    graph: PdDspGraph.Graph,
    sourceNodeId: PdDspGraph.NodeId,
    sinkNodeId: PdDspGraph.NodeId
): void => {
    const sourceNode = getNode(graph, sourceNodeId)
    const sinkNode = getNode(graph, sinkNodeId)
    Object.entries(sinkNode.sources).forEach(([inlet, sourceAddress]) => {
        if (sourceAddress.id === sourceNodeId) {
            delete sinkNode.sources[parseInt(inlet, 10)]
        }
    })
    Object.values(sourceNode.sinks).forEach((sinkAddresses) =>
        remove(sinkAddresses, (sinkAddress) => sinkAddress.id === sinkNodeId)
    )
}

export const deleteNode = (
    graph: PdDspGraph.Graph,
    nodeId: PdDspGraph.NodeId
): void => {
    const node = graph[nodeId]
    if (!node) {
        return
    }

    // `slice(0)` because array might change during iteration
    Object.values(node.sources).forEach((sourceAddress) =>
        disconnectNodes(graph, sourceAddress.id, nodeId)
    )
    Object.values(node.sinks).forEach((sinkAddresses) =>
        sinkAddresses
            .slice(0)
            .forEach((sinkAddress) =>
                disconnectNodes(graph, nodeId, sinkAddress.id)
            )
    )

    delete graph[nodeId]
}

const _ensurePortletAddressArray = (
    portletMap: PdDspGraph.PortletAddressMap,
    portletId: PdDspGraph.PortletId
): Array<PdDspGraph.PortletAddress> =>
    (portletMap[portletId] = portletMap[portletId] || [])
