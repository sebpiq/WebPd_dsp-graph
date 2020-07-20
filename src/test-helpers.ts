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
        sources?: { [inletId: number]: Array<ConcisePortletAddress> }
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
    Object.entries(conciseGraph).forEach(([nodeId, partialNode]) => {
        partialNode.sources = partialNode.sources || {}
        partialNode.sinks = partialNode.sinks || {}
        const sources: PdDspGraph.Node['sources'] = {}
        const sinks: PdDspGraph.Node['sinks'] = {}
        Object.entries(partialNode.sources).forEach(
            ([inletId, portletAddresses]) => {
                sources[parseFloat(inletId)] = portletAddresses.map(
                    makePortletAddress
                )
            }
        )
        Object.entries(partialNode.sinks).forEach(
            ([outletId, portletAddresses]) => {
                sinks[parseFloat(outletId)] = portletAddresses.map(
                    makePortletAddress
                )
            }
        )
        graph[nodeId] = {
            ...nodeDefaults(nodeId),
            sources,
            sinks,
        }
    })
    return graph
}

export const assertGraphsEqual = (
    actual: PdDspGraph.Graph,
    expected: PdDspGraph.Graph
): void => {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort())
    Object.keys(actual).forEach((nodeId) =>
        assert.deepEqual(actual[nodeId], expected[nodeId])
    )
}
