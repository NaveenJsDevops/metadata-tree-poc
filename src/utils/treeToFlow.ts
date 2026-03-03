// ─── Tree → React Flow Transformation ────────────────────────────────────────
// Derives React Flow nodes & edges from normalized TreeState.
// Collapsed parents hide their entire subtrees.

import type { Node, Edge } from "reactflow";
import type { TreeState } from "../types/tree";
import { NODE_WIDTH, NODE_HEIGHT } from "./layout";

/**
 * Convert a normalized TreeState into React Flow nodes + edges.
 *
 * Rules:
 *  - Collapsed nodes suppress rendering of all their descendants.
 *  - Position is set to {0, 0}; applyLayout() fills in real coordinates.
 *  - Labels/handlers are forwarded via node.data.
 */
export function treeToFlow(
    tree: TreeState,
    handlers: {
        onAddChild: (id: string) => void;
        onDelete: (id: string) => void;
        onToggleCollapse: (id: string) => void;
        onLabelChange: (id: string, label: string) => void;
    }
): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // BFS — skip children of collapsed nodes
    const roots = Object.values(tree).filter((n) => n.parentId === null);
    const queue = roots.map((r) => r.id);
    const visited = new Set<string>();

    while (queue.length > 0) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);

        const treeNode = tree[id];
        if (!treeNode) continue;

        nodes.push({
            id,
            type: "custom",
            position: { x: 0, y: 0 }, // layout fills this in
            data: {
                label: treeNode.label,
                collapsed: treeNode.collapsed ?? false,
                hasChildren: treeNode.children.length > 0,
                onAddChild: handlers.onAddChild,
                onDelete: handlers.onDelete,
                onToggleCollapse: handlers.onToggleCollapse,
                onLabelChange: handlers.onLabelChange,
            },
            style: { width: NODE_WIDTH, height: NODE_HEIGHT },
        });

        if (treeNode.parentId) {
            edges.push({
                id: `e-${treeNode.parentId}-${id}`,
                source: treeNode.parentId,
                target: id,
                style: { stroke: "#6366f1", strokeWidth: 2 },
                animated: false,
            });
        }

        // Only queue children when node is NOT collapsed
        if (!treeNode.collapsed) {
            queue.push(...treeNode.children);
        }
    }

    return { nodes, edges };
}
