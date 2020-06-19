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

export const pdJsonDefaults = (): PdJson.Pd => ({
    patches: {},
    arrays: {},
})

export const pdJsonPatchDefaults = (
    id: PdJson.ObjectGlobalId
): PdJson.Patch => ({
    id,
    nodes: {},
    args: [],
    outlets: [],
    inlets: [],
    connections: [],
})

export const pdJsonNodeDefaults = (id: PdJson.ObjectLocalId): PdJson.Node => ({
    id,
    args: [],
    proto: 'DUMMY',
})

export const nodeDefaults = (
    id: PdDspGraph.NodeId,
    proto = 'DUMMY'
): PdDspGraph.Node => ({
    id,
    proto,
    sources: {},
    sinks: {},
})
