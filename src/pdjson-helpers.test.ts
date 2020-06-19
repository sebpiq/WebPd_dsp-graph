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
import { getReferencesToSubpatch } from './pdjson-helpers'
import { pdJsonPatchDefaults, pdJsonNodeDefaults } from './test-helpers'

describe('pdjson-helpers', () => {
    describe('getReferencesToSubpatch', () => {
        it('should return nodes referencing the given patch', () => {
            const pd: PdJson.Pd = {
                patches: {
                    '0': {
                        ...pdJsonPatchDefaults('0'),
                        nodes: {
                            '0': {
                                ...pdJsonNodeDefaults('0'),
                                refId: '2',
                            },
                            '1': pdJsonNodeDefaults('1'),
                            '2': {
                                ...pdJsonNodeDefaults('2'),
                                refId: '2',
                            },
                            '3': {
                                ...pdJsonNodeDefaults('3'),
                                refId: '1234',
                            },
                        },
                    },
                    '1': {
                        ...pdJsonPatchDefaults('1'),
                        nodes: {
                            '12': {
                                ...pdJsonNodeDefaults('12'),
                                refId: '2',
                            },
                        },
                    },
                    '2': {
                        ...pdJsonPatchDefaults('2'),
                        nodes: {
                            '0': pdJsonNodeDefaults('0'),
                        },
                    },
                },
                arrays: {},
            }

            assert.deepEqual(getReferencesToSubpatch(pd, '2'), [
                ['0', '0'],
                ['0', '2'],
                ['1', '12'],
            ])

            assert.deepEqual(getReferencesToSubpatch(pd, '1234'), [['0', '3']])

            assert.deepEqual(getReferencesToSubpatch(pd, '5678'), [])
        })
    })
})
