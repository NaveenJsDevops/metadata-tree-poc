// ─── Tree Helper Utilities ────────────────────────────────────────────────────
// Pure functions — no side effects, fully testable.

import type { TreeState } from "../types/tree";

/**
 * Collect all descendant IDs of a given node (BFS).
 * Returns an array including the node itself.
 */
export function getDescendants(tree: TreeState, id: string): string[] {
    const result: string[] = [];
    const queue = [id];
    while (queue.length > 0) {
        const current = queue.shift()!;
        result.push(current);
        const node = tree[current];
        if (node) {
            queue.push(...node.children);
        }
    }
    return result;
}

/**
 * Check whether `childId` is inside the subtree rooted at `ancestorId`.
 * Used for cycle prevention during drag & drop re-parenting.
 */
export function isDescendant(
    tree: TreeState,
    ancestorId: string,
    childId: string
): boolean {
    const descendants = getDescendants(tree, ancestorId);
    return descendants.includes(childId);
}

/**
 * Returns the IDs of all root nodes (nodes with no parent).
 */
export function getRootNodes(tree: TreeState): string[] {
    return Object.values(tree)
        .filter((n) => n.parentId === null)
        .map((n) => n.id);
}

/**
 * Basic structural validation of the tree.
 * Returns an array of error messages (empty means valid).
 */
export function validateTree(tree: TreeState): string[] {
    const errors: string[] = [];
    for (const node of Object.values(tree)) {
        // Parent must exist
        if (node.parentId !== null && !tree[node.parentId]) {
            errors.push(`Node "${node.id}" references missing parent "${node.parentId}"`);
        }
        // Children must exist
        for (const cid of node.children) {
            if (!tree[cid]) {
                errors.push(`Node "${node.id}" references missing child "${cid}"`);
            }
        }
        // Child must reference this node as parent
        for (const cid of node.children) {
            if (tree[cid] && tree[cid].parentId !== node.id) {
                errors.push(`Child "${cid}" does not point back to parent "${node.id}"`);
            }
        }
    }
    return errors;
}

/** Generate a unique ID (timestamp + random suffix) */
export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
