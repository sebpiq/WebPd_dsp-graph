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

import assert from 'assert'
import { testGraphIntegrity, mapNodeSources, portletAddressesEqual } from './graph-helpers'
import differenceWith from 'lodash.differencewith'

type GraphConnection = [PdDspGraph.PortletAddress, PdDspGraph.PortletAddress]
type ConciseGraphConnection = [ConcisePortletAddress, ConcisePortletAddress]

export const pdJsonDefaults = (): PdJson.Pd => ({
    patches: {},
    arrays: {},
})

export const pdJsonPatchDefaults = (
    id: PdJson.ObjectGlobalId
): PdJson.Patch => ({
    id,
    nodes: {},
    args: [],
    outlets: [],
    inlets: [],
    connections: [],
})

export const pdJsonNodeDefaults = (id: PdJson.ObjectLocalId): PdJson.Node => ({
    id,
    args: [],
    proto: 'DUMMY',
})

export const nodeDefaults = (
    id: PdDspGraph.NodeId,
    proto = 'DUMMY'
): PdDspGraph.Node => ({
    id,
    proto,
    sources: {},
    sinks: {},
})

type ConcisePdConnection = [
    PdDspGraph.NodeId,
    PdDspGraph.PortletId,
    PdDspGraph.NodeId,
    PdDspGraph.PortletId
]
type ConcisePortletAddress = [PdDspGraph.NodeId, PdDspGraph.PortletId]
type ConcisePatch = Partial<Omit<PdJson.Patch, 'connections'>> & {
    nodes: { [localId: string]: PdJson.Node }
    connections: Array<ConcisePdConnection>
}
type ConcisePd = { patches: { [patchId: string]: ConcisePatch } }
type ConciseGraph = {
    [pdNodeId: string]: {
        sinks?: { [outletId: number]: Array<ConcisePortletAddress> }
    }
}

const makeConnection = (
    conciseConnection: ConcisePdConnection
): PdJson.Connection => ({
    source: {
        id: conciseConnection[0],
        portlet: conciseConnection[1],
    },
    sink: {
        id: conciseConnection[2],
        portlet: conciseConnection[3],
    },
})

const makePortletAddress = (
    conciseAddress: ConcisePortletAddress
): PdDspGraph.PortletAddress => ({
    id: conciseAddress[0],
    portlet: conciseAddress[1],
})

export const makePd = (concisePd: ConcisePd): PdJson.Pd => {
    const pd: PdJson.Pd = pdJsonDefaults()

    Object.entries(concisePd.patches).forEach(([patchId, concisePatch]) => {
        pd.patches[patchId] = {
            ...pdJsonPatchDefaults(patchId),
            ...pd.patches[patchId],
            ...concisePatch,
            connections: concisePatch.connections.map(makeConnection),
        }
    })
    return pd
}

export const makeGraph = (conciseGraph: ConciseGraph): PdDspGraph.Graph => {
    const graph: PdDspGraph.Graph = {}
    Object.entries(conciseGraph).forEach(([nodeId]) => {
        graph[nodeId] = {
            ...nodeDefaults(nodeId),
            sources: {},
            sinks: {},
        }
    })

    Object.entries(conciseGraph).forEach(([sourceId, partialNode]) => {
        Object.entries(partialNode.sinks || {}).forEach(
            ([outletStr, sinkAddresses]) => {
                const outlet = parseFloat(outletStr)
                graph[sourceId].sinks[outlet] = []
                sinkAddresses.forEach(([sinkId, inlet]) => {
                    graph[sourceId].sinks[outlet].push(makePortletAddress([sinkId, inlet]))
                    graph[sinkId].sources[inlet] = makePortletAddress([sourceId, outlet])
                })
            }
        )
    })

    return graph
}

export const assertGraphsEqual = (
    actual: PdDspGraph.Graph,
    expected: PdDspGraph.Graph
): void => {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), 'graphs should contain the same nodes')
    Object.keys(actual).forEach((nodeId) =>
        assert.deepEqual(actual[nodeId], expected[nodeId])
    )
}

export const assertGraphIntegrity = (graph: PdDspGraph.Graph) => {
    const graphIntegrity = testGraphIntegrity(graph)
    assert.equal(graphIntegrity, null, `graph integrity test failed : \n ${JSON.stringify(graphIntegrity, null, 2)}`)
}

export const assertGraphConnections = (
    graph: PdDspGraph.Graph,
    conciseExpectedConnections: Array<ConciseGraphConnection>, 
) => {
    const expectedConnections = conciseExpectedConnections.map(connection => connection.map(makePortletAddress))
    assertGraphIntegrity(graph)
    const actualConnections = Object.keys(graph).reduce((connections, nodeId) => {
        const moreConnections = mapNodeSources(graph, nodeId, 
            (sourceAddress, sinkAddress) => [sourceAddress, sinkAddress])
        return [...connections, ...moreConnections]
    }, [] as Array<GraphConnection>)

    const _comparator = ([a1, a2]: GraphConnection, [b1, b2]: GraphConnection) => portletAddressesEqual(a1, b1) && portletAddressesEqual(a2, b2)
    const unexpectedConnections = differenceWith(actualConnections, expectedConnections, _comparator)
    const missingConnections = differenceWith(expectedConnections, actualConnections, _comparator)

    assert.equal(unexpectedConnections.length, 0, `Unexpected connections : ${JSON.stringify(unexpectedConnections, null, 2)}`)
    assert.equal(missingConnections.length, 0, `Missing connections : ${JSON.stringify(missingConnections, null, 2)}`)
}