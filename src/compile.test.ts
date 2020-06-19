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
import { buildGraph, flattenGraph, _inlineSubpatchInlets, _inlineSubpatchOutlets, _inlineSubpatch, IdTranslationMaps } from './compile'
import { pdJsonPatchDefaults, pdJsonNodeDefaults, nodeDefaults, pdJsonDefaults } from './test-helpers'
import { getReferencesToSubpatch } from './pdjson-helpers'

type ConciseConnection = [PdJson.ObjectLocalId, PdJson.PortletId, PdJson.ObjectLocalId, PdJson.PortletId]
type ConcisePatch = Partial<Omit<PdJson.Patch, 'connections'>> & {nodes: {[localId: string]: PdJson.Node}, connections: Array<ConciseConnection>}
type ConcisePd = {patches: {[patchId: string]: ConcisePatch}}
type ConciseGraph = {[pdNodeId: string]: {sinks?: Array<ConciseConnection>, sources?: Array<ConciseConnection>}}

const _makeIdTranslator = (idTranslationMaps: IdTranslationMaps) => 
    (pdId: PdJson.ObjectLocalId) => {
        const [patchId, _] = pdId.split(':')
        return idTranslationMaps[patchId][pdId]
    }

const _makeConnection = (conciseConnection: ConciseConnection): PdDspGraph.Connection => ({
    source: {
        id: conciseConnection[0], 
        portlet: conciseConnection[1]
    },
    sink: {
        id: conciseConnection[2], 
        portlet: conciseConnection[3]
    },
})

const _makePd = (concisePd: ConcisePd) => {
    const pd: PdJson.Pd = pdJsonDefaults()

    Object.entries(concisePd.patches).forEach(([patchId, concisePatch]) => {
        pd.patches[patchId] = {
            ...pdJsonPatchDefaults(patchId),
            ...pd.patches[patchId],
            ...concisePatch,
            connections: concisePatch.connections.map(_makeConnection)
        }
    })
    return pd
}

const _makeGraph = (idTranslationMaps: IdTranslationMaps, conciseGraph: ConciseGraph) => {
    const _translateId = _makeIdTranslator(idTranslationMaps)

    const _makeConnection = (conciseConnection: ConciseConnection): PdDspGraph.Connection => ({
        source: {
            id: _translateId(conciseConnection[0]), 
            portlet: conciseConnection[1]
        },
        sink: {
            id: _translateId(conciseConnection[2]), 
            portlet: conciseConnection[3]
        },
    })

    const graph: PdDspGraph.Graph = {}
    Object.entries(conciseGraph).forEach(([pdNodeId, partialNode]) => {
        partialNode.sources = partialNode.sources || []
        partialNode.sinks = partialNode.sinks || []
        const nodeId = _translateId(pdNodeId)
        graph[nodeId] = {
            ...nodeDefaults(nodeId),
            sources: partialNode.sources.map((conciseConnection) => _makeConnection(conciseConnection)),
            sinks: partialNode.sinks.map((conciseConnection) => _makeConnection(conciseConnection)),
        } 
    })
    return graph
}

const _assertGraphsEqual = (actual: PdDspGraph.Graph, expected: PdDspGraph.Graph) => {
    assert.deepEqual(Object.keys(actual), Object.keys(expected))
    Object.keys(actual).forEach(nodeId =>
        assert.deepEqual(actual[nodeId], expected[nodeId])
    )
}


describe('compile', () => {

    describe('buildGraph', () => {
        it('should build the basic graph from a pd json object', () => {
            const pd: PdJson.Pd = _makePd({
                patches: {
                    // Connected nodes
                    'patch1': {
                        nodes: {
                            'node1': {
                                ...pdJsonNodeDefaults('node1'),
                                refId: '2',
                            },
                            'node2': pdJsonNodeDefaults('node2'),
                        },
                        connections: [
                            ['node1', 0, 'node2', 0],
                        ]
                    },
                    // A node with no connections
                    'patch2': {
                        nodes: {
                            'node1': pdJsonNodeDefaults('node1'),
                        },
                        connections: []
                    },
                }
            })

            const [graph, idTranslationMaps] = buildGraph(pd)
            assert.deepEqual(idTranslationMaps, {
                'patch1': {
                    'node1': '0',
                    'node2': '1',
                },
                'patch2': {
                    'node1': '2',
                }
            })
            const connection = {
                source: {id: '0', portlet: 0},
                sink: {id: '1', portlet: 0},
            }
            assert.deepEqual(graph, {
                '0': {
                    id: '0',
                    proto: 'DUMMY',
                    sources: [],
                    sinks: [connection],
                },
                '1': {
                    id: '1',
                    proto: 'DUMMY',
                    sources: [connection],
                    sinks: [],
                },
                '2': {
                    id: '2',
                    proto: 'DUMMY',
                    sinks: [],
                    sources: [],
                }
            })
        })
    })

    describe('flattenGraph', () => {

        describe('_inlineSubpatchInlets', () => {
            it('should establish connections from outer patch to subpatch through inlets', () => {
                const pd: PdJson.Pd = _makePd({
                    patches: {
                        'p': {
                            ...pdJsonPatchDefaults('p'),
                            nodes: {
                                'p:node1': pdJsonNodeDefaults('p:node1'),
                                'p:node2': pdJsonNodeDefaults('p:node2'),
                                'p:sp': {
                                    ...pdJsonNodeDefaults('p:sp'),
                                    refId: 'sp',
                                },
                            },
                            connections: [
                                ['p:node1', 0, 'p:sp', 0],
                                ['p:node1', 0, 'p:sp', 1],
                                ['p:node2', 0, 'p:sp', 0],
                            ]
                        },
                        'sp': {
                            ...pdJsonPatchDefaults('sp'),
                            nodes: {
                                'sp:inlet1': pdJsonNodeDefaults('sp:inlet1'),
                                'sp:inlet2': pdJsonNodeDefaults('sp:inlet2'),
                                'sp:node1': pdJsonNodeDefaults('sp:node1'),
                                'sp:node2': pdJsonNodeDefaults('sp:node2'),
                            },
                            connections: [
                                ['sp:inlet1', 0, 'sp:node1', 0],
                                ['sp:inlet2', 0, 'sp:node2', 3],
                            ],
                            inlets: ['sp:inlet1', 'sp:inlet2'],
                        },
                    },
                })

                const [graph, idTranslationMaps] = buildGraph(pd)
                const referencesToSubpatch = getReferencesToSubpatch(pd, 'sp')
                _inlineSubpatchInlets(graph, pd.patches['sp'], referencesToSubpatch, idTranslationMaps)
                
                // inlet nodes should be deleted
                assert.equal(graph[idTranslationMaps['sp']['sp:inlet1']], undefined)
                assert.equal(graph[idTranslationMaps['sp']['sp:inlet2']], undefined)

                const expectedGraph = _makeGraph(idTranslationMaps, {
                    'p:node1': {
                        sinks: [
                            ['p:node1', 0, 'p:sp', 0],
                            ['p:node1', 0, 'p:sp', 1],
                            ['p:node1', 0, 'sp:node1', 0],
                            ['p:node1', 0, 'sp:node2', 3],
                        ],
                    },
                    'p:node2': {
                        sinks: [
                            ['p:node2', 0, 'p:sp', 0],
                            ['p:node2', 0, 'sp:node1', 0]
                        ],
                    },
                    'p:sp': {
                        sources: [
                            ['p:node1', 0, 'p:sp', 0],
                            ['p:node1', 0, 'p:sp', 1],
                            ['p:node2', 0, 'p:sp', 0],
                        ]
                    },
                    'sp:node1': {
                        sources: [
                            ['p:node1', 0, 'sp:node1', 0],
                            ['p:node2', 0, 'sp:node1', 0]
                        ],
                    },
                    'sp:node2': {
                        sources: [
                            ['p:node1', 0, 'sp:node2', 3],
                        ],
                    }
                })

                _assertGraphsEqual(graph, expectedGraph)
            })    
        })

        describe('_inlineSubpatchOutlets', () => {
            it('should get lists of nodes to connect to collapse inlets', () => {
                const pd: PdJson.Pd = _makePd({
                    patches: {
                        'p': {
                            ...pdJsonPatchDefaults('p'),
                            nodes: {
                                'p:sp': {
                                    ...pdJsonNodeDefaults('p:sp'),
                                    refId: 'sp',
                                },
                                'p:node1': pdJsonNodeDefaults('p:node1'),
                                'p:node2': pdJsonNodeDefaults('p:node2'),
                            },
                            connections: [
                                ['p:sp', 0, 'p:node1', 0],
                                ['p:sp', 1, 'p:node1', 1],
                                ['p:sp', 0, 'p:node2', 1],
                            ]
                        },
                        'sp': {
                            ...pdJsonPatchDefaults('sp'),
                            nodes: {
                                'sp:node1': pdJsonNodeDefaults('sp:node1'),
                                'sp:node2': pdJsonNodeDefaults('sp:node2'),
                                'sp:outlet1': pdJsonNodeDefaults('sp:outlet1'),
                                'sp:outlet2': pdJsonNodeDefaults('sp:outlet2'),
                            },
                            connections: [
                                ['sp:node1', 3, 'sp:outlet1', 0],
                                ['sp:node2', 0, 'sp:outlet2', 0],
                            ],
                            outlets: ['sp:outlet1', 'sp:outlet2'],
                        },
                    },
                })

                const [graph, idTranslationMaps] = buildGraph(pd)
                const referencesToSubpatch = getReferencesToSubpatch(pd, 'sp')
                _inlineSubpatchOutlets(graph, pd.patches['sp'], referencesToSubpatch, idTranslationMaps)

                // outlet nodes should be deleted
                assert.equal(graph[idTranslationMaps['sp']['sp:outlet1']], undefined)
                assert.equal(graph[idTranslationMaps['sp']['sp:outlet2']], undefined)

                const expectedGraph = _makeGraph(idTranslationMaps, {
                    'sp:node1': {
                        sinks: [
                            ['sp:node1', 3, 'p:node1', 0],
                            ['sp:node1', 3, 'p:node2', 1],
                        ],
                    },
                    'sp:node2': {
                        sinks: [
                            ['sp:node2', 0, 'p:node1', 1],
                        ],
                    },
                    'p:sp': {
                        sinks: [
                            ['p:sp', 0, 'p:node1', 0],
                            ['p:sp', 1, 'p:node1', 1],
                            ['p:sp', 0, 'p:node2', 1],
                        ],
                    },
                    'p:node1': {
                        sources: [
                            ['p:sp', 0, 'p:node1', 0],
                            ['p:sp', 1, 'p:node1', 1],
                            ['sp:node1', 3, 'p:node1', 0],
                            ['sp:node2', 0, 'p:node1', 1],
                        ],
                    },
                    'p:node2': {
                        sources: [
                            ['p:sp', 0, 'p:node2', 1],
                            ['sp:node1', 3, 'p:node2', 1],
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
                        'p': {
                            nodes: {
                                'p:node1': pdJsonNodeDefaults('p:node1'),
                                'p:sp': {
                                    ...pdJsonNodeDefaults('p:sp'),
                                    refId: 'sp',
                                },
                                'p:node2': pdJsonNodeDefaults('p:node2'),
                                'p:node3': pdJsonNodeDefaults('p:node3'),
                            },
                            connections: [
                                ['p:node1', 2, 'p:sp', 0],
                                ['p:sp', 0, 'p:node2', 1],
                                ['p:node2', 0, 'p:node3', 1],
                            ]
                        },
                        'sp': {
                            nodes: {
                                'sp:inlet': pdJsonNodeDefaults('sp:inlet'),
                                'sp:node1': pdJsonNodeDefaults('sp:node1'),
                                'sp:outlet': pdJsonNodeDefaults('sp:outlet'),
                            },
                            connections: [
                                ['sp:inlet', 0, 'sp:node1', 1],
                                ['sp:node1', 3, 'sp:outlet', 0],
                            ],
                            inlets: ['sp:inlet'],
                            outlets: ['sp:outlet'],
                        },
                    },
                })

                const [graph, idTranslationMaps] = buildGraph(pd)
                _inlineSubpatch(pd, pd.patches['sp'], graph, idTranslationMaps)

                const expectedGraph: PdDspGraph.Graph = _makeGraph(idTranslationMaps, {
                    'p:node1': {
                        sources: [],
                        sinks: [
                            ['p:node1', 2, 'sp:node1', 1],
                        ],
                    },
                    'sp:node1': {
                        sources: [
                            ['p:node1', 2, 'sp:node1', 1],
                        ],
                        sinks: [
                            ['sp:node1', 3, 'p:node2', 1],
                        ],
                    },
                    'p:node2': {
                        sources: [
                            ['sp:node1', 3, 'p:node2', 1],
                        ],
                        sinks: [
                            ['p:node2', 0, 'p:node3', 1],
                        ],
                    },
                    'p:node3': {
                        sources: [
                            ['p:node2', 0, 'p:node3', 1],
                        ],
                        sinks: [],
                    },
                })
                _assertGraphsEqual(graph, expectedGraph)
            })

            it('should inline graph with passthrough connections', () => {
                const pd: PdJson.Pd = _makePd({
                    patches: {
                        // Connected nodes
                        'p': {
                            nodes: {
                                'p:node1': pdJsonNodeDefaults('p:node1'),
                                'p:sp': {
                                    ...pdJsonNodeDefaults('p:sp'),
                                    refId: 'sp',
                                },
                                'p:node2': pdJsonNodeDefaults('p:node2'),
                            },
                            connections: [
                                ['p:node1', 1, 'p:sp', 0],
                                ['p:sp', 0, 'p:node2', 1],
                            ]
                        },
                        'sp': {
                            nodes: {
                                'sp:inlet': pdJsonNodeDefaults('sp:inlet'),
                                'sp:outlet': pdJsonNodeDefaults('sp:outlet'),
                            },
                            connections: [
                                ['sp:inlet', 0, 'sp:outlet', 0],
                            ],
                            inlets: ['sp:inlet'],
                            outlets: ['sp:outlet'],
                        },
                    },
                })
        
                const [graph, idTranslationMaps] = buildGraph(pd)
                _inlineSubpatch(pd, pd.patches['sp'], graph, idTranslationMaps)
    
                const expectedGraph: PdDspGraph.Graph = _makeGraph(idTranslationMaps, {
                    'p:node1': {
                        sources: [],
                        sinks: [
                            ['p:node1', 1, 'p:node2', 1],
                        ],
                    },
                    'p:node2': {
                        sources: [
                            ['p:node1', 1, 'p:node2', 1],
                        ],
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
                    'p': {
                        nodes: {
                            'p:node1': pdJsonNodeDefaults('p:node1'),
                            'p:sp': {
                                ...pdJsonNodeDefaults('p:sp'),
                                refId: 'sp',
                            },
                            'p:node2': pdJsonNodeDefaults('p:node2'),
                        },
                        connections: [
                            ['p:node1', 1, 'p:sp', 0],
                            ['p:sp', 0, 'p:node2', 3],
                        ]
                    },
                    'sp': {
                        nodes: {
                            'sp:inlet': pdJsonNodeDefaults('sp:inlet'),
                            'sp:ssp': {
                                ...pdJsonNodeDefaults('sp:ssp'),
                                refId: 'ssp',
                            },
                            'sp:outlet': pdJsonNodeDefaults('sp:outlet'),
                        },
                        connections: [
                            ['sp:inlet', 0,'sp:ssp', 0],
                            ['sp:ssp', 0,'sp:outlet', 0],
                        ],
                        inlets: ['sp:inlet'],
                        outlets: ['sp:outlet'],
                    },
                    'ssp': {
                        ...pdJsonPatchDefaults('ssp'),
                        nodes: {
                            'ssp:inlet': pdJsonNodeDefaults('ssp:inlet'),
                            'ssp:node1': pdJsonNodeDefaults('ssp:node1'),
                            'ssp:outlet': pdJsonNodeDefaults('ssp:outlet'),
                        },
                        connections: [
                            ['ssp:inlet', 0, 'ssp:node1', 1],
                            ['ssp:node1', 2, 'ssp:outlet', 0],
                        ],
                        inlets: ['ssp:inlet'],
                        outlets: ['ssp:outlet'],
                    }
                },
            })
    
            const [graph, idTranslationMaps] = buildGraph(pd)
            flattenGraph(pd, graph, idTranslationMaps)

            const expectedGraph: PdDspGraph.Graph = _makeGraph(idTranslationMaps, {
                'p:node1': {
                    sources: [],
                    sinks: [
                        ['p:node1', 1, 'ssp:node1', 1],
                    ],
                },
                'p:node2': {
                    sources: [
                        ['ssp:node1', 2, 'p:node2', 3],
                    ],
                    sinks: [],
                },
                'ssp:node1': {
                    sources: [
                        ['p:node1', 1, 'ssp:node1', 1],
                    ],
                    sinks: [
                        ['ssp:node1', 2, 'p:node2', 3],
                    ],
                },
            })
            _assertGraphsEqual(graph, expectedGraph)
        })

        it('should flatten complex graph and remove subpatches', () => {
            const pd: PdJson.Pd = _makePd({
                patches: {
                    // Connected nodes
                    'p': {
                        nodes: {
                            'p:node1': pdJsonNodeDefaults('p:node1'),
                            'p:node2': pdJsonNodeDefaults('p:node2'),
                            'p:sp': {
                                ...pdJsonNodeDefaults('p:sp'),
                                refId: 'sp',
                            },
                            'p:node4': pdJsonNodeDefaults('p:node4'),
                            'p:node5': pdJsonNodeDefaults('p:node5'),
                        },
                        connections: [
                            // Connections from nodes to subpatch
                            ['p:node1', 0, 'p:sp', 0,],
                            ['p:node1', 0, 'p:sp', 1,],
                            ['p:node2', 0, 'p:sp', 0,],
                            // Connections from subpatch to nodes
                            ['p:sp', 0, 'p:node4', 0,],
                            ['p:sp', 1, 'p:node4', 1,],
                            ['p:sp', 0, 'p:node5', 0,],
                        ]
                    },
                    'sp': {
                        ...pdJsonPatchDefaults('sp'),
                        nodes: {
                            'sp:inlet1': pdJsonNodeDefaults('sp:inlet1'),
                            'sp:inlet2': pdJsonNodeDefaults('sp:inlet2'),
                            'sp:node1': pdJsonNodeDefaults('sp:node1'),
                            'sp:node2': pdJsonNodeDefaults('sp:node2'),
                            'sp:ssp': {
                                ...pdJsonNodeDefaults('sp:ssp'),
                                refId: 'ssp',
                            },
                            'sp:outlet1': pdJsonNodeDefaults('sp:outlet1'),
                            'sp:outlet2': pdJsonNodeDefaults('sp:outlet2'),
                        },
                        connections: [
                            // inlets to nodes
                            ['sp:inlet1', 0,'sp:node1', 0],
                            ['sp:inlet2', 0,'sp:node2', 3],
                            // connections to subsubpatch
                            ['sp:inlet2', 0,'sp:ssp', 0],
                            // Outlets to nodes
                            ['sp:node1', 1, 'sp:outlet1', 0],
                            ['sp:node2', 1, 'sp:outlet1', 0],
                        ],
                        inlets: ['sp:inlet1', 'sp:inlet2'],
                        outlets: ['sp:outlet1', 'sp:outlet2'],
                    },
                    'ssp': {
                        ...pdJsonPatchDefaults('ssp'),
                        nodes: {
                            'ssp:inlet1': pdJsonNodeDefaults('ssp:inlet1'),
                            'ssp:node1': pdJsonNodeDefaults('ssp:node1'),
                        },
                        connections: [
                            ['ssp:inlet1', 0, 'ssp:node1', 3],
                        ],
                        inlets: ['ssp:inlet1'],
                    }
                },
            })
    
            const [graph, idTranslationMaps] = buildGraph(pd)
            flattenGraph(pd, graph, idTranslationMaps)

            const expectedGraph: PdDspGraph.Graph = _makeGraph(idTranslationMaps, {
                'p:node1': {
                    sources: [],
                    sinks: [
                        ['p:node1', 0, 'sp:node1', 0],
                        ['p:node1', 0, 'sp:node2', 3],
                        ['p:node1', 0, 'ssp:node1', 3],
                    ],
                },
                'p:node2': {
                    sources: [],
                    sinks: [
                        ['p:node2', 0, 'sp:node1', 0],
                    ],
                },
                // Subpatch
                'sp:node1': {
                    sources: [
                        ['p:node1', 0, 'sp:node1', 0],
                        ['p:node2', 0, 'sp:node1', 0],
                    ],
                    sinks: [
                        ['sp:node1', 1, 'p:node4', 0],
                        ['sp:node1', 1, 'p:node5', 0],
                    ],
                },
                'sp:node2': {
                    sources: [
                        ['p:node1', 0, 'sp:node2', 3],
                    ],
                    sinks: [
                        ['sp:node2', 1, 'p:node4', 0],
                        ['sp:node2', 1, 'p:node5', 0],
                    ],
                },
                // Sub-subpatch
                'ssp:node1': {
                    sources: [
                        ['p:node1', 0, 'ssp:node1', 3],
                    ],
                    sinks: [],
                },
                // Sub-subpatch : END 
                // Subpatch : END
                'p:node4': {
                    sources: [
                        ['sp:node1', 1, 'p:node4', 0],
                        ['sp:node2', 1, 'p:node4', 0],
                    ],
                    sinks: [],
                },
                'p:node5': {
                    sources: [
                        ['sp:node1', 1, 'p:node5', 0],
                        ['sp:node2', 1, 'p:node5', 0],
                    ],
                    sinks: [],
                },
            })

            _assertGraphsEqual(graph, expectedGraph)
        })
    })

})