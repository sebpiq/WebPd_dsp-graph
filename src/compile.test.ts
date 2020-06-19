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
import {
    buildGraph,
    flattenGraph,
    _inlineSubpatchInlets,
    _inlineSubpatchOutlets,
    _inlineSubpatch,
} from './compile'
import {
    pdJsonPatchDefaults,
    pdJsonNodeDefaults,
    nodeDefaults,
    pdJsonDefaults,
} from './test-helpers'
import { getReferencesToSubpatch } from './pdjson-helpers'

type ConciseConnection = [
    PdDspGraph.NodeId,
    PdDspGraph.PortletId,
    PdDspGraph.NodeId,
    PdDspGraph.PortletId
]
type ConcisePatch = Partial<Omit<PdJson.Patch, 'connections'>> & {
    nodes: { [localId: string]: PdJson.Node }
    connections: Array<ConciseConnection>
}
type ConcisePd = { patches: { [patchId: string]: ConcisePatch } }
type ConciseGraph = {
    [pdNodeId: string]: {
        sinks?: Array<ConciseConnection>
        sources?: Array<ConciseConnection>
    }
}

const _makeConnection = (
    conciseConnection: ConciseConnection
): PdDspGraph.Connection => ({
    source: {
        id: conciseConnection[0],
        portlet: conciseConnection[1],
    },
    sink: {
        id: conciseConnection[2],
        portlet: conciseConnection[3],
    },
})

const _makePd = (concisePd: ConcisePd): PdJson.Pd => {
    const pd: PdJson.Pd = pdJsonDefaults()

    Object.entries(concisePd.patches).forEach(([patchId, concisePatch]) => {
        pd.patches[patchId] = {
            ...pdJsonPatchDefaults(patchId),
            ...pd.patches[patchId],
            ...concisePatch,
            connections: concisePatch.connections.map(_makeConnection),
        }
    })
    return pd
}

const _makeGraph = (conciseGraph: ConciseGraph): PdDspGraph.Graph => {
    const _makeConnection = (
        conciseConnection: ConciseConnection
    ): PdDspGraph.Connection => ({
        source: {
            id: conciseConnection[0],
            portlet: conciseConnection[1],
        },
        sink: {
            id: conciseConnection[2],
            portlet: conciseConnection[3],
        },
    })

    const graph: PdDspGraph.Graph = {}
    Object.entries(conciseGraph).forEach(([nodeId, partialNode]) => {
        partialNode.sources = partialNode.sources || []
        partialNode.sinks = partialNode.sinks || []
        graph[nodeId] = {
            ...nodeDefaults(nodeId),
            sources: partialNode.sources.map((conciseConnection) =>
                _makeConnection(conciseConnection)
            ),
            sinks: partialNode.sinks.map((conciseConnection) =>
                _makeConnection(conciseConnection)
            ),
        }
    })
    return graph
}

const _assertGraphsEqual = (
    actual: PdDspGraph.Graph,
    expected: PdDspGraph.Graph
): void => {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort())
    Object.keys(actual).forEach((nodeId) =>
        assert.deepEqual(actual[nodeId], expected[nodeId])
    )
}

describe('compile', () => {
    describe('buildGraph', () => {
        it('should build the basic graph from a pd json object', () => {
            const pd: PdJson.Pd = _makePd({
                patches: {
                    // Connected nodes
                    p1: {
                        nodes: {
                            n1: {
                                ...pdJsonNodeDefaults('n1'),
                                refId: 'p2',
                            },
                            n2: pdJsonNodeDefaults('n2'),
                        },
                        connections: [['n1', 0, 'n2', 0]],
                    },
                    // A node with no connections
                    p2: {
                        nodes: {
                            n1: pdJsonNodeDefaults('n1'),
                        },
                        connections: [],
                    },
                },
            })

            const graph = buildGraph(pd)

            const connection = {
                source: { id: 'p1:n1', portlet: 0 },
                sink: { id: 'p1:n2', portlet: 0 },
            }
            assert.deepEqual(graph, {
                'p1:n1': {
                    id: 'p1:n1',
                    proto: 'DUMMY',
                    sources: [],
                    sinks: [connection],
                },
                'p1:n2': {
                    id: 'p1:n2',
                    proto: 'DUMMY',
                    sources: [connection],
                    sinks: [],
                },
                'p2:n1': {
                    id: 'p2:n1',
                    proto: 'DUMMY',
                    sinks: [],
                    sources: [],
                },
            })
        })
    })

    describe('flattenGraph', () => {
        describe('_inlineSubpatchInlets', () => {
            it('should establish connections from outer patch to subpatch through inlets', () => {
                const pd: PdJson.Pd = _makePd({
                    patches: {
                        p: {
                            ...pdJsonPatchDefaults('p'),
                            nodes: {
                                n1: pdJsonNodeDefaults('n1'),
                                n2: pdJsonNodeDefaults('n2'),
                                sp: {
                                    ...pdJsonNodeDefaults('sp'),
                                    refId: 'sp',
                                },
                            },
                            connections: [
                                ['n1', 0, 'sp', 0],
                                ['n1', 0, 'sp', 1],
                                ['n2', 0, 'sp', 0],
                            ],
                        },
                        sp: {
                            ...pdJsonPatchDefaults('sp'),
                            nodes: {
                                inlet1: pdJsonNodeDefaults('inlet1'),
                                inlet2: pdJsonNodeDefaults('inlet2'),
                                n1: pdJsonNodeDefaults('n1'),
                                n2: pdJsonNodeDefaults('n2'),
                            },
                            connections: [
                                ['inlet1', 0, 'n1', 0],
                                ['inlet2', 0, 'n2', 3],
                            ],
                            inlets: ['inlet1', 'inlet2'],
                        },
                    },
                })

                const graph = buildGraph(pd)
                const referencesToSubpatch = getReferencesToSubpatch(pd, 'sp')
                _inlineSubpatchInlets(
                    graph,
                    pd.patches['sp'],
                    referencesToSubpatch
                )

                // inlet nodes should be deleted
                assert.equal(graph['sp:inlet1'], undefined)
                assert.equal(graph['sp:inlet2'], undefined)

                const expectedGraph = _makeGraph({
                    'p:n1': {
                        sinks: [
                            ['p:n1', 0, 'p:sp', 0],
                            ['p:n1', 0, 'p:sp', 1],
                            ['p:n1', 0, 'sp:n1', 0],
                            ['p:n1', 0, 'sp:n2', 3],
                        ],
                    },
                    'p:n2': {
                        sinks: [
                            ['p:n2', 0, 'p:sp', 0],
                            ['p:n2', 0, 'sp:n1', 0],
                        ],
                    },
                    'p:sp': {
                        sources: [
                            ['p:n1', 0, 'p:sp', 0],
                            ['p:n1', 0, 'p:sp', 1],
                            ['p:n2', 0, 'p:sp', 0],
                        ],
                    },
                    'sp:n1': {
                        sources: [
                            ['p:n1', 0, 'sp:n1', 0],
                            ['p:n2', 0, 'sp:n1', 0],
                        ],
                    },
                    'sp:n2': {
                        sources: [['p:n1', 0, 'sp:n2', 3]],
                    },
                })

                _assertGraphsEqual(graph, expectedGraph)
            })
        })

        describe('_inlineSubpatchOutlets', () => {
            it('should get lists of nodes to connect to collapse inlets', () => {
                const pd: PdJson.Pd = _makePd({
                    patches: {
                        p: {
                            ...pdJsonPatchDefaults('p'),
                            nodes: {
                                sp: {
                                    ...pdJsonNodeDefaults('sp'),
                                    refId: 'sp',
                                },
                                n1: pdJsonNodeDefaults('n1'),
                                n2: pdJsonNodeDefaults('n2'),
                            },
                            connections: [
                                ['sp', 0, 'n1', 0],
                                ['sp', 1, 'n1', 1],
                                ['sp', 0, 'n2', 1],
                            ],
                        },
                        sp: {
                            ...pdJsonPatchDefaults('sp'),
                            nodes: {
                                n1: pdJsonNodeDefaults('n1'),
                                n2: pdJsonNodeDefaults('n2'),
                                outlet1: pdJsonNodeDefaults('outlet1'),
                                outlet2: pdJsonNodeDefaults('outlet2'),
                            },
                            connections: [
                                ['n1', 3, 'outlet1', 0],
                                ['n2', 0, 'outlet2', 0],
                            ],
                            outlets: ['outlet1', 'outlet2'],
                        },
                    },
                })

                const graph = buildGraph(pd)

                // outlet nodes should be created
                assert.equal(!!graph['sp:outlet1'], true)
                assert.equal(!!graph['sp:outlet2'], true)

                const referencesToSubpatch = getReferencesToSubpatch(pd, 'sp')
                _inlineSubpatchOutlets(
                    graph,
                    pd.patches['sp'],
                    referencesToSubpatch
                )

                // outlet nodes should be deleted
                assert.equal(graph['sp:outlet1'], undefined)
                assert.equal(graph['sp:outlet2'], undefined)

                const expectedGraph = _makeGraph({
                    'sp:n1': {
                        sinks: [
                            ['sp:n1', 3, 'p:n1', 0],
                            ['sp:n1', 3, 'p:n2', 1],
                        ],
                    },
                    'sp:n2': {
                        sinks: [['sp:n2', 0, 'p:n1', 1]],
                    },
                    'p:sp': {
                        sinks: [
                            ['p:sp', 0, 'p:n1', 0],
                            ['p:sp', 1, 'p:n1', 1],
                            ['p:sp', 0, 'p:n2', 1],
                        ],
                    },
                    'p:n1': {
                        sources: [
                            ['p:sp', 0, 'p:n1', 0],
                            ['p:sp', 1, 'p:n1', 1],
                            ['sp:n1', 3, 'p:n1', 0],
                            ['sp:n2', 0, 'p:n1', 1],
                        ],
                    },
                    'p:n2': {
                        sources: [
                            ['p:sp', 0, 'p:n2', 1],
                            ['sp:n1', 3, 'p:n2', 1],
                        ],
                    },
                })
                _assertGraphsEqual(graph, expectedGraph)
            })
        })

        describe('_inlineSubpatch', () => {
            it('inline a simple subpatch', () => {
                const pd: PdJson.Pd = _makePd({
                    patches: {
                        p: {
                            nodes: {
                                n1: pdJsonNodeDefaults('n1'),
                                sp: {
                                    ...pdJsonNodeDefaults('sp'),
                                    refId: 'sp',
                                },
                                n2: pdJsonNodeDefaults('n2'),
                                n3: pdJsonNodeDefaults('n3'),
                            },
                            connections: [
                                ['n1', 2, 'sp', 0],
                                ['sp', 0, 'n2', 1],
                                ['n2', 0, 'n3', 1],
                            ],
                        },
                        sp: {
                            nodes: {
                                inlet: pdJsonNodeDefaults('inlet'),
                                n1: pdJsonNodeDefaults('n1'),
                                outlet: pdJsonNodeDefaults('outlet'),
                            },
                            connections: [
                                ['inlet', 0, 'n1', 1],
                                ['n1', 3, 'outlet', 0],
                            ],
                            inlets: ['inlet'],
                            outlets: ['outlet'],
                        },
                    },
                })

                const graph = buildGraph(pd)
                _inlineSubpatch(pd, pd.patches['sp'], graph)

                const expectedGraph: PdDspGraph.Graph = _makeGraph({
                    'p:n1': {
                        sources: [],
                        sinks: [['p:n1', 2, 'sp:n1', 1]],
                    },
                    'sp:n1': {
                        sources: [['p:n1', 2, 'sp:n1', 1]],
                        sinks: [['sp:n1', 3, 'p:n2', 1]],
                    },
                    'p:n2': {
                        sources: [['sp:n1', 3, 'p:n2', 1]],
                        sinks: [['p:n2', 0, 'p:n3', 1]],
                    },
                    'p:n3': {
                        sources: [['p:n2', 0, 'p:n3', 1]],
                        sinks: [],
                    },
                })
                _assertGraphsEqual(graph, expectedGraph)
            })

            it('should inline graph with passthrough connections', () => {
                const pd: PdJson.Pd = _makePd({
                    patches: {
                        p: {
                            nodes: {
                                n1: pdJsonNodeDefaults('n1'),
                                sp: {
                                    ...pdJsonNodeDefaults('sp'),
                                    refId: 'sp',
                                },
                                n2: pdJsonNodeDefaults('n2'),
                            },
                            connections: [
                                ['n1', 1, 'sp', 0],
                                ['sp', 0, 'n2', 1],
                            ],
                        },
                        sp: {
                            nodes: {
                                inlet: pdJsonNodeDefaults('inlet'),
                                outlet: pdJsonNodeDefaults('outlet'),
                            },
                            connections: [['inlet', 0, 'outlet', 0]],
                            inlets: ['inlet'],
                            outlets: ['outlet'],
                        },
                    },
                })

                const graph = buildGraph(pd)
                _inlineSubpatch(pd, pd.patches['sp'], graph)

                const expectedGraph: PdDspGraph.Graph = _makeGraph({
                    'p:n1': {
                        sources: [],
                        sinks: [['p:n1', 1, 'p:n2', 1]],
                    },
                    'p:n2': {
                        sources: [['p:n1', 1, 'p:n2', 1]],
                        sinks: [],
                    },
                })
                _assertGraphsEqual(graph, expectedGraph)
            })
        })

        it('should flatten graph and remove subpatches', () => {
            const pd: PdJson.Pd = _makePd({
                patches: {
                    // Connected nodes
                    p: {
                        nodes: {
                            n1: pdJsonNodeDefaults('n1'),
                            sp: {
                                ...pdJsonNodeDefaults('sp'),
                                refId: 'sp',
                            },
                            n2: pdJsonNodeDefaults('n2'),
                        },
                        connections: [
                            ['n1', 1, 'sp', 0],
                            ['sp', 0, 'n2', 3],
                        ],
                    },
                    sp: {
                        nodes: {
                            inlet: pdJsonNodeDefaults('inlet'),
                            ssp: {
                                ...pdJsonNodeDefaults('ssp'),
                                refId: 'ssp',
                            },
                            outlet: pdJsonNodeDefaults('outlet'),
                        },
                        connections: [
                            ['inlet', 0, 'ssp', 0],
                            ['ssp', 0, 'outlet', 0],
                        ],
                        inlets: ['inlet'],
                        outlets: ['outlet'],
                    },
                    ssp: {
                        ...pdJsonPatchDefaults('ssp'),
                        nodes: {
                            inlet: pdJsonNodeDefaults('inlet'),
                            n1: pdJsonNodeDefaults('n1'),
                            outlet: pdJsonNodeDefaults('outlet'),
                        },
                        connections: [
                            ['inlet', 0, 'n1', 1],
                            ['n1', 2, 'outlet', 0],
                        ],
                        inlets: ['inlet'],
                        outlets: ['outlet'],
                    },
                },
            })

            const graph = buildGraph(pd)
            flattenGraph(pd, graph)

            const expectedGraph: PdDspGraph.Graph = _makeGraph({
                'p:n1': {
                    sources: [],
                    sinks: [['p:n1', 1, 'ssp:n1', 1]],
                },
                'p:n2': {
                    sources: [['ssp:n1', 2, 'p:n2', 3]],
                    sinks: [],
                },
                'ssp:n1': {
                    sources: [['p:n1', 1, 'ssp:n1', 1]],
                    sinks: [['ssp:n1', 2, 'p:n2', 3]],
                },
            })
            _assertGraphsEqual(graph, expectedGraph)
        })

        it('should flatten complex graph and remove subpatches', () => {
            const pd: PdJson.Pd = _makePd({
                patches: {
                    // Connected nodes
                    p: {
                        nodes: {
                            n1: pdJsonNodeDefaults('n1'),
                            n2: pdJsonNodeDefaults('n2'),
                            sp: {
                                ...pdJsonNodeDefaults('sp'),
                                refId: 'sp',
                            },
                            n4: pdJsonNodeDefaults('n4'),
                            n5: pdJsonNodeDefaults('n5'),
                        },
                        connections: [
                            // Connections from nodes to subpatch
                            ['n1', 0, 'sp', 0],
                            ['n1', 0, 'sp', 1],
                            ['n2', 0, 'sp', 0],
                            // Connections from subpatch to nodes
                            ['sp', 0, 'n4', 0],
                            ['sp', 1, 'n4', 1],
                            ['sp', 0, 'n5', 0],
                        ],
                    },
                    sp: {
                        ...pdJsonPatchDefaults('sp'),
                        nodes: {
                            inlet1: pdJsonNodeDefaults('inlet1'),
                            inlet2: pdJsonNodeDefaults('inlet2'),
                            n1: pdJsonNodeDefaults('n1'),
                            n2: pdJsonNodeDefaults('n2'),
                            ssp: {
                                ...pdJsonNodeDefaults('ssp'),
                                refId: 'ssp',
                            },
                            outlet1: pdJsonNodeDefaults('outlet1'),
                            outlet2: pdJsonNodeDefaults('outlet2'),
                        },
                        connections: [
                            // inlets to nodes
                            ['inlet1', 0, 'n1', 0],
                            ['inlet2', 0, 'n2', 3],
                            // connections to subsubpatch
                            ['inlet2', 0, 'ssp', 0],
                            // Outlets to nodes
                            ['n1', 1, 'outlet1', 0],
                            ['n2', 1, 'outlet1', 0],
                        ],
                        inlets: ['inlet1', 'inlet2'],
                        outlets: ['outlet1', 'outlet2'],
                    },
                    ssp: {
                        ...pdJsonPatchDefaults('ssp'),
                        nodes: {
                            inlet1: pdJsonNodeDefaults('inlet1'),
                            n1: pdJsonNodeDefaults('n1'),
                        },
                        connections: [['inlet1', 0, 'n1', 3]],
                        inlets: ['inlet1'],
                    },
                },
            })

            const graph = buildGraph(pd)
            flattenGraph(pd, graph)

            const expectedGraph: PdDspGraph.Graph = _makeGraph({
                'p:n1': {
                    sources: [],
                    sinks: [
                        ['p:n1', 0, 'sp:n1', 0],
                        ['p:n1', 0, 'sp:n2', 3],
                        ['p:n1', 0, 'ssp:n1', 3],
                    ],
                },
                'p:n2': {
                    sources: [],
                    sinks: [['p:n2', 0, 'sp:n1', 0]],
                },
                // Subpatch
                'sp:n1': {
                    sources: [
                        ['p:n1', 0, 'sp:n1', 0],
                        ['p:n2', 0, 'sp:n1', 0],
                    ],
                    sinks: [
                        ['sp:n1', 1, 'p:n4', 0],
                        ['sp:n1', 1, 'p:n5', 0],
                    ],
                },
                'sp:n2': {
                    sources: [['p:n1', 0, 'sp:n2', 3]],
                    sinks: [
                        ['sp:n2', 1, 'p:n4', 0],
                        ['sp:n2', 1, 'p:n5', 0],
                    ],
                },
                // Sub-subpatch
                'ssp:n1': {
                    sources: [['p:n1', 0, 'ssp:n1', 3]],
                    sinks: [],
                },
                // Sub-subpatch : END
                // Subpatch : END
                'p:n4': {
                    sources: [
                        ['sp:n1', 1, 'p:n4', 0],
                        ['sp:n2', 1, 'p:n4', 0],
                    ],
                    sinks: [],
                },
                'p:n5': {
                    sources: [
                        ['sp:n1', 1, 'p:n5', 0],
                        ['sp:n2', 1, 'p:n5', 0],
                    ],
                    sinks: [],
                },
            })

            _assertGraphsEqual(graph, expectedGraph)
        })
    })
})
