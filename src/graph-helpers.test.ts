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

import { makeGraph, nodeDefaults } from '@webpd/shared/test-helpers'
import {
    mapNodeSources,
    mapNodeSinks,
    testGraphIntegrity,
} from './graph-helpers'
import assert from 'assert'

describe('graph-helpers', () => {
    describe('mapSources', () => {
        it('should map all the sources', () => {
            const graph: PdDspGraph.Graph = makeGraph({
                n1: {},
                n2: {
                    sinks: {
                        '0': [
                            ['n1', 0],
                            ['n1', 1],
                        ],
                    },
                },
                n3: {
                    sinks: {
                        '1': [['n1', 2]],
                    },
                },
            })

            const results = mapNodeSources(
                graph,
                'n1',
                (sourceAddress, sinkAddress) => [sourceAddress, sinkAddress]
            )
            assert.deepEqual(results, [
                [
                    { id: 'n2', portlet: 0 },
                    { id: 'n1', portlet: 0 },
                ],
                [
                    { id: 'n2', portlet: 0 },
                    { id: 'n1', portlet: 1 },
                ],
                [
                    { id: 'n3', portlet: 1 },
                    { id: 'n1', portlet: 2 },
                ],
            ])
        })
    })

    describe('mapSinks', () => {
        it('should map all sinks', () => {
            const graph: PdDspGraph.Graph = makeGraph({
                n1: {},
                n2: {
                    sinks: {
                        '0': [
                            ['n1', 0],
                            ['n1', 1],
                        ],
                        '1': [['n3', 1]],
                    },
                },
                n3: {
                    sinks: {
                        '1': [['n2', 1]],
                    },
                },
            })

            const results = mapNodeSinks(
                graph,
                'n2',
                (sourceAddress, sinkAddress) => [sourceAddress, sinkAddress]
            )
            assert.deepEqual(results, [
                [
                    { id: 'n1', portlet: 0 },
                    { id: 'n2', portlet: 0 },
                ],
                [
                    { id: 'n1', portlet: 1 },
                    { id: 'n2', portlet: 0 },
                ],
                [
                    { id: 'n3', portlet: 1 },
                    { id: 'n2', portlet: 1 },
                ],
            ])
        })
    })

    describe('testGraphIntegrity', () => {
        it('should return null if graph is ok', () => {
            const graphIntegrity = testGraphIntegrity({
                n1: {
                    ...nodeDefaults('n1', 'bla'),
                    sources: {
                        '0': { id: 'n2', portlet: 2 },
                    },
                },
                n2: {
                    ...nodeDefaults('n2', 'blo'),
                    sinks: {
                        '2': [
                            { id: 'n1', portlet: 0 },
                            { id: 'n3', portlet: 22 },
                        ],
                    },
                },
                n3: {
                    ...nodeDefaults('n3', 'blu'),
                    sources: {
                        '22': { id: 'n2', portlet: 2 },
                    },
                },
            })
            assert.equal(graphIntegrity, null)
        })

        it('should return connection inconsistencies', () => {
            const graphIntegrity = testGraphIntegrity({
                n1: {
                    ...nodeDefaults('n1', 'bla'),
                    sources: {
                        '0': { id: 'n2', portlet: 2 },
                    },
                },
                n2: nodeDefaults('n2', 'blo'),
            })
            assert.deepEqual(graphIntegrity, {
                inconsistentConnections: [
                    [
                        { id: 'n2', portlet: 2 },
                        { id: 'n1', portlet: 0 },
                    ],
                ],
            })
        })
    })
})
