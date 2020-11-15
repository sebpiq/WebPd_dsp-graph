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
    assertGraphsEqual,
} from './test-helpers'
import {
    pdJsonPatchDefaults,
    pdJsonNodeDefaults,
    makePd,
    makeGraph,
    nodeDefaults,
    makeRegistry,
} from '@webpd/shared/test-helpers'
import { getReferencesToSubpatch } from './pdjson-helpers'
import { Compilation } from './compilation'

const DUMMY_REGISTRY = makeRegistry({
    [pdJsonNodeDefaults('').type]: {},
})

describe('compile', () => {
    describe('buildGraph', () => {
        it('should build the basic graph from a pd json object', () => {
            const pd: PdJson.Pd = makePd({
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
            const compilation: Compilation = new Compilation(pd, DUMMY_REGISTRY)

            buildGraph(compilation)

            assert.deepStrictEqual(compilation.graph, {
                'pd:p1:n1': {
                    id: 'pd:p1:n1',
                    type: 'DUMMY',
                    sources: {},
                    sinks: {
                        0: [{ id: 'pd:p1:n2', portlet: 0 }],
                    },
                },
                'pd:p1:n2': {
                    id: 'pd:p1:n2',
                    type: 'DUMMY',
                    sources: {
                        0: { id: 'pd:p1:n1', portlet: 0 },
                    },
                    sinks: {},
                },
                'pd:p2:n1': {
                    id: 'pd:p2:n1',
                    type: 'DUMMY',
                    sinks: {},
                    sources: {},
                },
            })
        })

        it('should add mixer nodes if several connections to the same sink', () => {
            const pd: PdJson.Pd = makePd({
                patches: {
                    p: {
                        nodes: {
                            nodeSource1A: pdJsonNodeDefaults('nodeSource1A'),
                            nodeSource1B: pdJsonNodeDefaults('nodeSource1B'),
                            nodeSink1: {
                                ...pdJsonNodeDefaults('nodeSink1'),
                                type: 'type1',
                            },

                            nodeSource2A: pdJsonNodeDefaults('nodeSource2A'),
                            nodeSource2B: pdJsonNodeDefaults('nodeSource2B'),
                            nodeSink2: {
                                ...pdJsonNodeDefaults('nodeSink2'),
                                type: 'type2',
                            },
                        },
                        connections: [
                            ['nodeSource1A', 0, 'nodeSink1', 0],
                            ['nodeSource1B', 0, 'nodeSink1', 0],
                            ['nodeSource2A', 0, 'nodeSink2', 0],
                            ['nodeSource2B', 0, 'nodeSink2', 0],
                        ],
                    },
                },
            })
            const registry: PdJson.Registry = makeRegistry({
                type1: {
                    inletType: 'signal' as PdJson.PortletType,
                    outletType: 'signal' as PdJson.PortletType,
                },
                type2: {
                    inletType: 'control' as PdJson.PortletType,
                    outletType: 'control' as PdJson.PortletType,
                },
            })
            const compilation: Compilation = new Compilation(pd, registry)

            buildGraph(compilation)

            assert.deepStrictEqual(Object.keys(compilation.graph).sort(), [
                'mixer:pd:p:nodeSink1:0',
                'mixer:pd:p:nodeSink2:0',
                'pd:p:nodeSink1',
                'pd:p:nodeSink2',
                'pd:p:nodeSource1A',
                'pd:p:nodeSource1B',
                'pd:p:nodeSource2A',
                'pd:p:nodeSource2B',
            ])
            assert.deepStrictEqual(compilation.graph['mixer:pd:p:nodeSink1:0'], {
                ...nodeDefaults('mixer:pd:p:nodeSink1:0', '+~'),
                sources: {
                    0: { id: 'pd:p:nodeSource1A', portlet: 0 },
                    1: { id: 'pd:p:nodeSource1B', portlet: 0 },
                },
                sinks: {
                    0: [{ id: 'pd:p:nodeSink1', portlet: 0 }],
                },
            })
            assert.deepStrictEqual(compilation.graph['mixer:pd:p:nodeSink2:0'], {
                ...nodeDefaults('mixer:pd:p:nodeSink2:0', 'trigger'),
                sources: {
                    0: { id: 'pd:p:nodeSource2A', portlet: 0 },
                    1: { id: 'pd:p:nodeSource2B', portlet: 0 },
                },
                sinks: {
                    0: [{ id: 'pd:p:nodeSink2', portlet: 0 }],
                },
            })
        })
    })

    describe('flattenGraph', () => {
        describe('_inlineSubpatchInlets', () => {
            it('should establish connections from outer patch to subpatch through inlets', () => {
                const pd: PdJson.Pd = makePd({
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
                const compilation = new Compilation(pd, DUMMY_REGISTRY)

                buildGraph(compilation)
                const referencesToSubpatch = getReferencesToSubpatch(pd, 'sp')
                _inlineSubpatchInlets(
                    compilation,
                    pd.patches['sp'],
                    referencesToSubpatch
                )

                // inlet nodes should be deleted
                assert.strictEqual(compilation.graph['sp:inlet1'], undefined)
                assert.strictEqual(compilation.graph['sp:inlet2'], undefined)

                const expectedGraph = makeGraph({
                    'pd:p:n1': {
                        sinks: {
                            0: [
                                ['pd:p:sp', 0],
                                ['pd:p:sp', 1],
                                ['pd:sp:n1', 0],
                                ['pd:sp:n2', 3],
                            ],
                        },
                    },
                    'pd:p:n2': {},
                    'pd:p:sp': {},
                    'pd:sp:n1': {},
                    'pd:sp:n2': {},
                })

                assertGraphsEqual(compilation.graph, expectedGraph)
            })
        })

        describe('_inlineSubpatchOutlets', () => {
            it('should get lists of nodes to connect to collapse inlets', () => {
                const pd: PdJson.Pd = makePd({
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
                const compilation = new Compilation(pd, DUMMY_REGISTRY)

                buildGraph(compilation)

                // outlet nodes should be created
                assert.strictEqual(!!compilation.graph['pd:sp:outlet1'], true)
                assert.strictEqual(!!compilation.graph['pd:sp:outlet2'], true)

                const referencesToSubpatch = getReferencesToSubpatch(pd, 'sp')
                _inlineSubpatchOutlets(
                    compilation,
                    pd.patches['sp'],
                    referencesToSubpatch
                )

                // outlet nodes should be deleted
                assert.strictEqual(compilation.graph['pd:sp:outlet1'], undefined)
                assert.strictEqual(compilation.graph['pd:sp:outlet2'], undefined)

                const expectedGraph = makeGraph({
                    'pd:sp:n1': {
                        sinks: {
                            3: [
                                ['pd:p:n1', 0],
                                ['pd:p:n2', 1],
                            ],
                        },
                    },
                    'pd:sp:n2': {
                        sinks: { 0: [['pd:p:n1', 1]] },
                    },
                    'pd:p:n1': {},
                    'pd:p:n2': {},
                })

                // We omit the subpatch node, because at this stage, its outlet connections
                // are not relevant anymore.
                const {
                    'pd:p:sp': trash,
                    ...compilationGraph
                } = compilation.graph
                assertGraphsEqual(compilationGraph, expectedGraph)
            })
        })

        describe('_inlineSubpatch', () => {
            it('inline a simple subpatch', () => {
                const pd: PdJson.Pd = makePd({
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

                const compilation = new Compilation(pd, DUMMY_REGISTRY)
                buildGraph(compilation)
                _inlineSubpatch(compilation, pd.patches['sp'])

                const expectedGraph: PdDspGraph.Graph = makeGraph({
                    'pd:p:n1': {
                        sinks: { 2: [['pd:sp:n1', 1]] },
                    },
                    'pd:sp:n1': {
                        sinks: { 3: [['pd:p:n2', 1]] },
                    },
                    'pd:p:n2': {
                        sinks: { 0: [['pd:p:n3', 1]] },
                    },
                    'pd:p:n3': {},
                })
                assertGraphsEqual(compilation.graph, expectedGraph)
            })

            it('should inline graph with passthrough connections', () => {
                const pd: PdJson.Pd = makePd({
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
                const compilation = new Compilation(pd, DUMMY_REGISTRY)

                buildGraph(compilation)
                _inlineSubpatch(compilation, pd.patches['sp'])

                const expectedGraph: PdDspGraph.Graph = makeGraph({
                    'pd:p:n1': {
                        sinks: { 1: [['pd:p:n2', 1]] },
                    },
                    'pd:p:n2': {},
                })
                assertGraphsEqual(compilation.graph, expectedGraph)
            })
        })

        it('should flatten graph and remove subpatches', () => {
            const pd: PdJson.Pd = makePd({
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
            const compilation = new Compilation(pd, DUMMY_REGISTRY)

            buildGraph(compilation)
            flattenGraph(compilation)

            const expectedGraph: PdDspGraph.Graph = makeGraph({
                'pd:p:n1': {
                    sinks: { 1: [['pd:ssp:n1', 1]] },
                },
                'pd:p:n2': {},
                'pd:ssp:n1': {
                    sinks: { 2: [['pd:p:n2', 3]] },
                },
            })
            assertGraphsEqual(compilation.graph, expectedGraph)
        })

        it('should flatten complex graph and remove subpatches', () => {
            const pd: PdJson.Pd = makePd({
                patches: {
                    // Connected nodes
                    p: {
                        nodes: {
                            n1: pdJsonNodeDefaults('n1'),
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
            const compilation = new Compilation(pd, DUMMY_REGISTRY)

            buildGraph(compilation)
            flattenGraph(compilation)

            const expectedGraph: PdDspGraph.Graph = makeGraph({
                'pd:p:n1': {
                    sinks: {
                        0: [
                            ['pd:sp:n1', 0],
                            ['pd:sp:n2', 3],
                            ['pd:ssp:n1', 3],
                        ],
                    },
                },
                // Subpatch
                'pd:sp:n1': {
                    sinks: {
                        1: [
                            ['pd:p:n4', 0],
                            ['pd:p:n5', 0],
                        ],
                    },
                },
                'pd:sp:n2': {
                    sinks: {},
                },
                // Sub-subpatch
                'pd:ssp:n1': {},
                // Sub-subpatch : END
                // Subpatch : END
                'pd:p:n4': {},
                'pd:p:n5': {},
            })

            assertGraphsEqual(compilation.graph, expectedGraph)
        })
    })
})
