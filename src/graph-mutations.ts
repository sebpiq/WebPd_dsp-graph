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
import { getSinks } from './graph-helpers'

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
    // Avoid duplicate connections : we check only on sinks,
    // because we assume that connections are always consistent on both sides.
    if (
        !getSinks(graph, sourceAddress.id, sinkAddress.portlet).some((otherSinkAddress) =>
            _portletAddressesEqual(sinkAddress, otherSinkAddress)
        )
    ) {
        _ensurePortletAddressArray(graph[sourceAddress.id].sinks, sourceAddress.portlet).push(sinkAddress)
        _ensurePortletAddressArray(graph[sinkAddress.id].sources, sinkAddress.portlet).push(sourceAddress)
    }
}

export const disconnectNodes = (
    graph: PdDspGraph.Graph,
    sourceNodeId: PdDspGraph.NodeId,
    sinkNodeId: PdDspGraph.NodeId
): void => {
    const sourceNode = graph[sourceNodeId]
    const sinkNode = graph[sinkNodeId]
    if (!sourceNode || !sinkNode) {
        throw new Error(
            `both '${sourceNodeId}' and '${sinkNodeId}' must exist in graph`
        )
    }
    Object.values(sourceNode.sinks).forEach(
        sinkAddresses => remove(sinkAddresses, (sinkAddress) => sinkAddress.id === sinkNodeId))
    Object.values(sinkNode.sources).forEach(
        sourceAddresses => remove(sourceAddresses, (sourceAddress) => sourceAddress.id === sourceNodeId))
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
    Object.values(node.sources)
        .forEach((sourceAddresses) =>
            sourceAddresses.slice(0).forEach(
                (sourceAddress) => disconnectNodes(graph, sourceAddress.id, nodeId))
        )
    Object.values(node.sinks)
        .forEach((sinkAddresses) =>
            sinkAddresses.slice(0).forEach(
                (sinkAddress) => disconnectNodes(graph, nodeId, sinkAddress.id))
        )

    delete graph[nodeId]
}

const _portletAddressesEqual = (
    a1: PdDspGraph.PortletAddress,
    a2: PdDspGraph.PortletAddress
): boolean =>
    a1.portlet === a2.portlet &&
    a1.id === a2.id

const _ensurePortletAddressArray = (portletMap: PdDspGraph.PortletAddressMap, portletId: PdDspGraph.PortletId) =>
    portletMap[portletId] = portletMap[portletId] || []