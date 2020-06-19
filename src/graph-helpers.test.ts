import assert from 'assert'
import { getSinks, getSources } from './graph-helpers'
import { nodeDefaults } from './test-helpers'

describe('graph-helpers', () => {
    describe('getSources', () => {
        it('should get sources', () => {
            const connection1 = {
                source: {
                    id: '0',
                    portlet: 2,
                },
                sink: {
                    id: '4',
                    portlet: 0,
                },
            }
            const connection2 = {
                source: {
                    id: '0',
                    portlet: 1,
                },
                sink: {
                    id: '1',
                    portlet: 1,
                },
            }
            const connection3 = {
                source: {
                    id: '1',
                    portlet: 0,
                },
                sink: {
                    id: '4',
                    portlet: 0,
                },
            }
            const connection4 = {
                source: {
                    id: '2',
                    portlet: 0,
                },
                sink: {
                    id: '4',
                    portlet: 1,
                },
            }

            const graph: PdDspGraph.Graph = {
                '0': {
                    ...nodeDefaults('0'),
                    sources: [],
                    sinks: [connection1, connection2],
                },
                '1': {
                    ...nodeDefaults('1'),
                    sources: [connection2],
                    sinks: [connection3],
                },
                '2': {
                    ...nodeDefaults('2'),
                    sources: [],
                    sinks: [connection4],
                },
                '3': {
                    ...nodeDefaults('3'),
                    sources: [],
                    sinks: [],
                },
                '4': {
                    ...nodeDefaults('4'),
                    sources: [connection1, connection3, connection4],
                    sinks: [],
                },
            }
            assert.deepEqual(getSources(graph, '4', 0), [
                {
                    id: '0',
                    portlet: 2,
                },
                {
                    id: '1',
                    portlet: 0,
                },
            ])
            assert.deepEqual(getSources(graph, '4', 1), [
                {
                    id: '2',
                    portlet: 0,
                },
            ])
        })
    })

    describe('getSinks', () => {
        it('should get sinks', () => {
            const connection1 = {
                source: {
                    id: '1',
                    portlet: 2,
                },
                sink: {
                    id: '4',
                    portlet: 0,
                },
            }
            const connection2 = {
                source: {
                    id: '1',
                    portlet: 2,
                },
                sink: {
                    id: '3',
                    portlet: 1,
                },
            }
            const connection3 = {
                source: {
                    id: '1',
                    portlet: 0,
                },
                sink: {
                    id: '2',
                    portlet: 0,
                },
            }

            const graph: PdDspGraph.Graph = {
                '0': {
                    ...nodeDefaults('0'),
                    sources: [],
                    sinks: [],
                },
                '1': {
                    ...nodeDefaults('1'),
                    sources: [],
                    sinks: [connection1, connection2, connection3],
                },
                '2': {
                    ...nodeDefaults('2'),
                    sources: [connection3],
                    sinks: [],
                },
                '3': {
                    ...nodeDefaults('3'),
                    sources: [connection2],
                    sinks: [],
                },
                '4': {
                    ...nodeDefaults('4'),
                    sources: [connection1],
                    sinks: [],
                },
            }

            assert.deepEqual(getSinks(graph, '1', 2), [
                {
                    id: '4',
                    portlet: 0,
                },
                {
                    id: '3',
                    portlet: 1,
                },
            ])
            assert.deepEqual(getSinks(graph, '1', 0), [
                {
                    id: '2',
                    portlet: 0,
                },
            ])
        })
    })
})
