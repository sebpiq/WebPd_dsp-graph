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
export const getSinks = (
    graph: PdDspGraph.Graph,
    nodeId: PdDspGraph.NodeId,
    outlet: PdDspGraph.PortletId
): Array<PdDspGraph.PortletAddress> => graph[nodeId].sinks[outlet] || []

export const getSources = (
    graph: PdDspGraph.Graph,
    nodeId: PdDspGraph.NodeId,
    inlet: PdDspGraph.PortletId
): Array<PdDspGraph.PortletAddress> => graph[nodeId].sources[inlet] || []
