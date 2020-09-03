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
    ensureNode,
    connect,
    disconnectNodes,
    deleteNode,
    disconnect,
    addNode,
} from './graph-mutations'
import { nodeDefaults, assertGraphConnections, makeGraph } from './test-helpers'

describe('graph-mutations', () => {
    describe('addNode', () => {
        it("should add the node to the graph if it isn't yet", () => {
            const graph: PdDspGraph.Graph = {}
            const node = {
                id: '1',
                proto: 'osc~',
                sinks: {},
                sources: {},
            }
            addNode(graph, node)
            assert.deepEqual(graph, {
                '1': node,
            })
        })

        it('should not add the node to the graph if it already exists', () => {
            const graph: PdDspGraph.Graph = {}
            const node1 = {
                id: '1',
                proto: 'osc~',
                sinks: {},
                sources: {},
            }
            const node1Bis = {
                id: '1',
                proto: 'phasor~',
                sinks: {},
                sources: {},
            }
            addNode(graph, node1)
            addNode(graph, node1Bis)
            assert.deepEqual(graph, {
                '1': node1,
            })
        })
    })

    describe('ensureNode', () => {
        it("should add the node to the graph if it isn't yet", () => {
            const graph: PdDspGraph.Graph = {}
            ensureNode(graph, '1', {
                id: '1',
                proto: 'osc~',
                args: [440],
            })
            assert.deepEqual(graph, {
                '1': {
                    id: '1',
                    proto: 'osc~',
                    sources: {},
                    sinks: {},
                },
            })
        })

        it('should not add the node to the graph if it already exists', () => {
            const graph: PdDspGraph.Graph = {
                '1': {
                    id: '1',
                    proto: 'osc~',
                    sources: {},
                    sinks: {},
                },
            }
            ensureNode(graph, '1', {
                id: '1',
                proto: 'phasor~',
                args: [440],
            })
            assert.deepEqual(graph['1'], {
                id: '1',
                proto: 'osc~',
                sources: {},
                sinks: {},
            })
        })
    })

    describe('connect', () => {

        it('should connect nodes that are not yet connected', () => {
            const graph: PdDspGraph.Graph = makeGraph({
                '0': {},
                '1': {},
            })
            assertGraphConnections(graph, [])

            connect(graph, { id: '0', portlet: 0 }, { id: '1', portlet: 0 })
            assertGraphConnections(graph, [
                [['0', 0], ['1', 0]]
            ])

            connect(graph, { id: '0', portlet: 0 }, { id: '1', portlet: 1 })
            assertGraphConnections(graph, [
                [['0', 0], ['1', 0]],
                [['0', 0], ['1', 1]]
            ])
        })

        it('should not add a connection if it already exists', () => {
            const graph: PdDspGraph.Graph = makeGraph({
                '0': {},
                '1': {},
            })

            connect(graph, { id: '0', portlet: 10 }, { id: '1', portlet: 20 })
            assertGraphConnections(graph, [
                [['0', 10], ['1', 20]]
            ])

            connect(graph, { id: '0', portlet: 10 }, { id: '1', portlet: 20 })
            assertGraphConnections(graph, [
                [['0', 10], ['1', 20]]
            ])
            // Check that not added twice
            assert.deepEqual(graph['0'].sinks, {10: [{ id: '1', portlet: 20 }]})
            assert.deepEqual(graph['1'].sources, {20: { id: '0', portlet: 10 }})
        })
    })

    describe('disconnect', () => {
        it('should disconnect nodes that are connected', () => {
            const graph: PdDspGraph.Graph = makeGraph({
                'n0': {
                    sinks: {
                        10: [
                            ['n1', 21],
                            ['n2', 22],
                        ],
                        11: [['n1', 23]],
                    },
                },
                'n1': {},
                'n2': {},
            })
            assertGraphConnections(graph, [
                [['n0', 10], ['n1', 21]],
                [['n0', 10], ['n2', 22]],
                [['n0', 11], ['n1', 23]],
            ])

            disconnect(graph, { id: 'n0', portlet: 10 }, { id: 'n2', portlet: 22 })
            assertGraphConnections(graph, [
                [['n0', 10], ['n1', 21]],
                [['n0', 11], ['n1', 23]],
            ])

            disconnect(graph, { id: 'n0', portlet: 11 }, { id: 'n1', portlet: 23 })
            assertGraphConnections(graph, [
                [['n0', 10], ['n1', 21]],
            ])
        })

        it('should do nothing if connection doesnt exist', () => {
            const graph: PdDspGraph.Graph = makeGraph({
                'n0': {
                    sinks: {
                        0: [['n1', 1]],
                    },
                },
                'n1': {},
            })

            disconnect(
                graph,
                { id: 'n0', portlet: 111 },
                { id: 'n1', portlet: 222 }
            )

            assertGraphConnections(graph, [
                [['n0', 0], ['n1', 1]],
            ])
        })
    })

    describe('disconnectNodes', () => {
        it('should disconnect all portlets from nodes', () => {
            const graph: PdDspGraph.Graph = makeGraph({
                '0': {},
                '1': {},
                '2': {},
            })

            connect(graph, { id: '0', portlet: 0 }, { id: '2', portlet: 0 })
            connect(graph, { id: '0', portlet: 1 }, { id: '2', portlet: 1 })
            connect(graph, { id: '1', portlet: 0 }, { id: '2', portlet: 2 })
            assertGraphConnections(graph, [
                [['0', 0], ['2', 0]],
                [['0', 1], ['2', 1]],
                [['1', 0], ['2', 2]],
            ])

            disconnectNodes(graph, '0', '2')
            assertGraphConnections(graph, [
                [['1', 0], ['2', 2]],
            ])
        })
    })

    describe('deleteNode', () => {
        it('should remove all connections, and delete node from graph', () => {
            const graph: PdDspGraph.Graph = makeGraph({
                '0': {},
                '1': {},
                '2': {},
            })

            connect(graph, { id: '0', portlet: 0 }, { id: '2', portlet: 0 })
            connect(graph, { id: '1', portlet: 0 }, { id: '2', portlet: 1 })
            assertGraphConnections(graph, [
                [['0', 0], ['2', 0]],
                [['1', 0], ['2', 1]],
            ])

            deleteNode(graph, '1')
            assert.deepEqual(Object.keys(graph), ['0', '2'])
            assertGraphConnections(graph, [
                [['0', 0], ['2', 0]],
            ])
        })

        it('should work fine when several sinks', () => {
            const graph: PdDspGraph.Graph = makeGraph({
                '0': {},
                '1': {},
                '2': {},
            })

            connect(graph, { id: '0', portlet: 0 }, { id: '1', portlet: 0 })
            connect(graph, { id: '0', portlet: 0 }, { id: '2', portlet: 1 })
            assertGraphConnections(graph, [
                [['0', 0], ['1', 0]],
                [['0', 0], ['2', 1]],
            ])

            deleteNode(graph, '0')
            assert.deepEqual(Object.keys(graph), ['1', '2'])
            assertGraphConnections(graph, [])
        })
    })
})
