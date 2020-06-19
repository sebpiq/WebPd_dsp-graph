export const getSinks = (graph: PdDspGraph.Graph, nodeId: PdDspGraph.NodeId, outlet: PdDspGraph.PortletId) => 
    graph[nodeId].sinks
        .filter(connection => connection.source.portlet === outlet)
        .map(connection => connection.sink)

export const getSources = (graph: PdDspGraph.Graph, nodeId: PdDspGraph.NodeId, inlet: PdDspGraph.PortletId) => 
    graph[nodeId].sources
        .filter(connection => connection.sink.portlet === inlet)
        .map(connection => connection.source)