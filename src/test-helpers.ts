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
    testGraphIntegrity,
    mapNodeSources,
    portletAddressesEqual,
} from './graph-helpers'
import {ConciseGraphConnection, makePortletAddress} from '@webpd/shared/test-helpers'
import differenceWith from 'lodash.differencewith'

type GraphConnection = [PdDspGraph.PortletAddress, PdDspGraph.PortletAddress]

export const assertGraphsEqual = (
    actual: PdDspGraph.Graph,
    expected: PdDspGraph.Graph
): void => {
    assert.deepStrictEqual(
        Object.keys(actual).sort(),
        Object.keys(expected).sort(),
        'graphs should contain the same nodes'
    )
    Object.keys(actual).forEach((nodeId) =>
        assert.deepStrictEqual(actual[nodeId], expected[nodeId])
    )
}

export const assertGraphIntegrity = (graph: PdDspGraph.Graph) => {
    const graphIntegrity = testGraphIntegrity(graph)
    assert.strictEqual(
        graphIntegrity,
        null,
        `graph integrity test failed : \n ${JSON.stringify(
            graphIntegrity,
            null,
            2
        )}`
    )
}

export const 
assertGraphConnections = (
    graph: PdDspGraph.Graph,
    conciseExpectedConnections: Array<ConciseGraphConnection>
) => {
    const expectedConnections = conciseExpectedConnections.map((connection) =>
        connection.map(makePortletAddress)
    )
    assertGraphIntegrity(graph)
    const actualConnections = Object.keys(graph).reduce(
        (connections, nodeId) => {
            const moreConnections = mapNodeSources(
                graph,
                nodeId,
                (sourceAddress, sinkAddress) => [sourceAddress, sinkAddress]
            )
            return [...connections, ...moreConnections]
        },
        [] as Array<GraphConnection>
    )

    const _comparator = (
        [a1, a2]: GraphConnection,
        [b1, b2]: GraphConnection
    ) => portletAddressesEqual(a1, b1) && portletAddressesEqual(a2, b2)
    const unexpectedConnections = differenceWith(
        actualConnections,
        expectedConnections,
        _comparator
    )
    const missingConnections = differenceWith(
        expectedConnections,
        actualConnections,
        _comparator
    )

    assert.strictEqual(
        unexpectedConnections.length,
        0,
        `Unexpected connections : ${JSON.stringify(
            unexpectedConnections,
            null,
            2
        )}`
    )
    assert.strictEqual(
        missingConnections.length,
        0,
        `Missing connections : ${JSON.stringify(missingConnections, null, 2)}`
    )
}
