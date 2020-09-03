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
import { Compilation } from './compilation'
import { pdJsonDefaults, makePd, pdJsonNodeDefaults } from './test-helpers'

describe('compilation', () => {
    let compilation: Compilation
    beforeEach(() => {
        compilation = new Compilation(pdJsonDefaults(), {})
    })

    describe('getSinkType', () => {
        it('should return the correct sink type', () => {
            const pd = makePd({
                ...pdJsonDefaults(),
                patches: {
                    p: {
                        nodes: {
                            n1: {
                                ...pdJsonNodeDefaults('n1'),
                                proto: 'type1',
                            },
                            n2: {
                                ...pdJsonNodeDefaults('n1'),
                                proto: 'type2',
                            },
                        },
                        connections: [],
                    },
                },
            })
            const registry: PdJson.Registry = {
                type1: {
                    getInletType: (): PdJson.PortletType =>
                        'signal' as PdJson.PortletType,
                    getOutletType: (): PdJson.PortletType =>
                        'signal' as PdJson.PortletType,
                },
                type2: {
                    getInletType: (): PdJson.PortletType =>
                        'control' as PdJson.PortletType,
                    getOutletType: (): PdJson.PortletType =>
                        'control' as PdJson.PortletType,
                },
            }
            compilation = new Compilation(pd, registry)
            assert.equal(
                compilation.getSinkType({ id: 'pd:p:n1', portlet: 1 }),
                'signal'
            )
            assert.equal(
                compilation.getSinkType({ id: 'pd:p:n2', portlet: 0 }),
                'control'
            )
        })
    })

    describe('graphNodeIdToPdNodeId', () => {
        it('should parse the graph node id', () => {
            const [patchId, nodeId] = compilation.graphNodeIdToPdNodeId(
                `pd:patch:node`
            )
            assert.equal(patchId, 'patch')
            assert.equal(nodeId, 'node')
        })
        it('should throw an error if invalid namespace', () => {
            assert.throws(() =>
                compilation.graphNodeIdToPdNodeId(`BLA:patch:node`)
            )
        })
    })

    describe('buildGraphNodeId', () => {
        it('should build a correct id', () => {
            assert.equal(
                compilation.buildGraphNodeId('patch', 'node'),
                `pd:patch:node`
            )
        })
    })

    describe('buildMixerNodeId', () => {
        it('should build a correct id', () => {
            assert.equal(
                compilation.buildMixerNodeId({ id: 'node', portlet: 44 }),
                `mixer:node:44`
            )
        })
    })
})
