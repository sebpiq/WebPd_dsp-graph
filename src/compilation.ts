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

enum IdNamespaces {
    PD = 'pd',
    MIXER = 'mixer',
}

export class Compilation {
    readonly pd: PdJson.Pd
    readonly graph: PdDspGraph.Graph
    readonly registry: PdJson.Registry

    constructor(pd: PdJson.Pd, registry: PdJson.Registry) {
        this.pd = pd
        this.registry = registry
        this.graph = {}
    }

    getSinkType(sinkAddress: PdDspGraph.PortletAddress): PdJson.PortletType {
        const [patchId, pdNodeId] = this.graphNodeIdToPdNodeId(sinkAddress.id)
        const pdNode = this.pd.patches[patchId].nodes[pdNodeId]
        const pdNodeTemplate = this.registry[pdNode.type]
        if (!pdNodeTemplate) {
            throw new Error(`unknown node type ${pdNode.type}`)
        }
        return pdNodeTemplate.getInletType(sinkAddress.portlet)
    }

    graphNodeIdToPdNodeId(
        nodeId: PdDspGraph.NodeId
    ): [PdJson.ObjectGlobalId, PdJson.ObjectLocalId] {
        const tokens = nodeId.split(':')
        if (tokens[0] !== IdNamespaces.PD) {
            throw new Error(`invalid namespace ${tokens[0]}`)
        }
        return [tokens[1], tokens[2]]
    }

    buildGraphNodeId(
        patchId: PdJson.ObjectGlobalId,
        nodeId: PdJson.ObjectLocalId
    ): PdDspGraph.NodeId {
        return `${IdNamespaces.PD}:${patchId}:${nodeId}`
    }

    buildMixerNodeId(
        sinkAddress: PdDspGraph.PortletAddress
    ): PdDspGraph.NodeId {
        return `${IdNamespaces.MIXER}:${sinkAddress.id}:${sinkAddress.portlet}`
    }
}
