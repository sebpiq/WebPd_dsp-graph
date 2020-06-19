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
import {ensureNode, connect, disconnectNodes, deleteNode} from './graph-mutations'
import { nodeDefaults } from './test-helpers'

describe('graph-mutations', () => {

    describe('ensureNode', () => {
        it('should add the node to the graph if it isn\'t yet', () => {
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
                    sources: [],
                    sinks: [],
                }
            })
        })

        it('should not add the node to the graph if it already exists', () => {
            const graph: PdDspGraph.Graph = {
                '1': {
                    id: '1',
                    proto: 'osc~',
                    sources: [],
                    sinks: [],
                }
            }
            ensureNode(graph, '1', {
                id: '1',
                proto: 'phasor~',
                args: [440],
            })
            assert.deepEqual(graph['1'], {
                id: '1',
                proto: 'osc~',
                sources: [],
                sinks: [],
            })
        })

    })

    describe('connect', () => {
        it('should connect nodes that are not yet connected', () => {
            const graph: PdDspGraph.Graph = {
                '0': nodeDefaults('0', 'osc~'),
                '1': nodeDefaults('1', 'dac~')
            }

            connect(
                graph, 
                { id: '0', portlet: 0 },
                { id: '1', portlet: 0 },
            )
            const connection1 = {
                source: { id: '0', portlet: 0 },
                sink: { id: '1', portlet: 0 },
            }
            assert.deepEqual(graph['0'].sources, [])
            assert.deepEqual(graph['0'].sinks, [ connection1 ])
            assert.deepEqual(graph['1'].sources, [ connection1 ])
            assert.deepEqual(graph['1'].sinks, [])

            connect(
                graph, 
                { id: '0', portlet: 0 },
                { id: '1', portlet: 1 },
            )
            const connection2 = {
                source: { id: '0', portlet: 0 },
                sink: { id: '1', portlet: 1 },
            }
            assert.deepEqual(graph['0'].sources, [])
            assert.deepEqual(graph['0'].sinks, [ connection1, connection2 ])
            assert.deepEqual(graph['1'].sources, [ connection1, connection2 ])
            assert.deepEqual(graph['1'].sinks, [])
        })

        it('should not add a connection if it already exists', () => {
            const graph: PdDspGraph.Graph = {
                '0': nodeDefaults('0', 'osc~'),
                '1': nodeDefaults('1', 'dac~')
            }

            connect(
                graph, 
                { id: '0', portlet: 0 },
                { id: '1', portlet: 0 },
            )
            const connection1 = graph['0'].sinks[0]
            assert.deepEqual(graph['0'].sinks, [connection1])
            assert.deepEqual(graph['1'].sources, [connection1])
            connect(
                graph, 
                { id: '0', portlet: 0 },
                { id: '1', portlet: 0 },
            )
            assert.deepEqual(graph['0'].sinks, [connection1])
            assert.deepEqual(graph['1'].sources, [connection1])
        })

    })

    describe('disconnectNodes', () => {
        it('should disconnect all portlets from nodes', () => {
            const graph: PdDspGraph.Graph = {
                '0': nodeDefaults('0', 'osc~'),
                '1': nodeDefaults('1', 'phasor~'),
                '2': nodeDefaults('2', 'dac~')
            }

            connect(
                graph, 
                { id: '0', portlet: 0 },
                { id: '2', portlet: 0 },
            )
            connect(
                graph, 
                { id: '0', portlet: 0 },
                { id: '2', portlet: 1 },
            )
            connect(
                graph, 
                { id: '1', portlet: 0 },
                { id: '2', portlet: 0 },
            )

            assert.equal(graph['0'].sinks.length, 2)
            assert.equal(graph['2'].sources.length, 3)

            disconnectNodes(graph, '0', '2')
            assert.equal(graph['0'].sinks.length, 0)
            assert.equal(graph['2'].sources.length, 1)
            assert.deepEqual(graph['2'].sources, [{
                source: { id: '1', portlet: 0 },
                sink: { id: '2', portlet: 0 },
            }])
        })
    })

    describe('deleteNode', () => {
        it('should remove all connections, and delete node from graph', () => {
            const graph: PdDspGraph.Graph = {
                '0': nodeDefaults('0', 'osc~'),
                '1': nodeDefaults('1', 'phasor~'),
                '2': nodeDefaults('2', 'dac~')
            }

            connect(
                graph, 
                { id: '0', portlet: 0 },
                { id: '2', portlet: 0 },
            )
            connect(
                graph, 
                { id: '1', portlet: 0 },
                { id: '2', portlet: 0 },
            )
            assert.equal(graph['0'].sinks.length, 1)
            assert.equal(graph['1'].sinks.length, 1)
            assert.equal(graph['2'].sources.length, 2)

            deleteNode(graph, '1')
            assert.deepEqual(Object.keys(graph), ['0', '2'])
            assert.equal(graph['0'].sinks.length, 1)
            assert.deepEqual(graph['2'].sources, [{
                source: { id: '0', portlet: 0 },
                sink: { id: '2', portlet: 0 },
            }])
        })

        it('should work fine when several source / sinks', () => {
            const graph: PdDspGraph.Graph = {
                '0': nodeDefaults('0', 'osc~'),
                '1': nodeDefaults('1', 'dac~'),
                '2': nodeDefaults('2', 'writesf~'),
            }

            connect(
                graph, 
                { id: '0', portlet: 0 },
                { id: '1', portlet: 0 },
            )
            connect(
                graph, 
                { id: '0', portlet: 0 },
                { id: '2', portlet: 1 },
            )
            assert.equal(graph['0'].sinks.length, 2)
            assert.equal(graph['1'].sources.length, 1)
            assert.equal(graph['2'].sources.length, 1)

            deleteNode(graph, '0')
            assert.deepEqual(Object.keys(graph), ['1', '2'])
            assert.equal(graph['1'].sources.length, 0)
            assert.equal(graph['2'].sources.length, 0)
        })
    })

})