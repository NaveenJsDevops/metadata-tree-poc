// ─── Dagre Auto Layout ────────────────────────────────────────────────────────
// Computes top-to-bottom tree layout using the dagre library.

import dagre from "dagre";
import type { Node, Edge } from "reactflow";

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 130;

/**
 * Run a dagre TB layout pass and return new React Flow nodes with
 * updated `position` values. Input arrays are NOT mutated.
 */
export function applyLayout(nodes: Node[], edges: Edge[]): Node[] {
    if (nodes.length === 0) return nodes;

    const g = new dagre.graphlib.Graph();

    g.setGraph({
        rankdir: "TB",
        nodesep: 60,   // horizontal gap between sibling nodes
        ranksep: 80,   // vertical gap between levels
        marginx: 40,
        marginy: 40,
    });

    g.setDefaultEdgeLabel(() => ({}));

    for (const node of nodes) {
        g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }

    for (const edge of edges) {
        g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    return nodes.map((node) => {
        const { x, y } = g.node(node.id);
        return {
            ...node,
            // dagre returns center positions; React Flow uses top-left corner
            position: {
                x: x - NODE_WIDTH / 2,
                y: y - NODE_HEIGHT / 2,
            },
        };
    });
}
