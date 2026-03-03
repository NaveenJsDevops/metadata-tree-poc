// ─── useTree — Central Business Logic Hook ────────────────────────────────────
//
// This is the SINGLE SOURCE OF TRUTH for all tree state.
// React Flow nodes/edges are always DERIVED from this state — never the source.

import { useState, useCallback } from "react";
import type { TreeState, BackendTreePayload } from "../types/tree";
import {
    getDescendants,
    isDescendant,
    generateId,
    validateTree,
} from "../utils/treeHelpers";
import { saveTree } from "../services/api";

const MAX_HISTORY = 50;

export function useTree(initialTree: TreeState) {
    const [tree, setTree] = useState<TreeState>(initialTree);

    // ── Undo / Redo stacks ────────────────────────────────────────────────────
    const [past, setPast] = useState<TreeState[]>([]);
    const [future, setFuture] = useState<TreeState[]>([]);

    // ── Internal helper: commit a new tree snapshot ───────────────────────────
    const commit = useCallback(
        (updater: (prev: TreeState) => TreeState) => {
            setTree((prev) => {
                const next = updater(prev);
                setPast((p) => [...p.slice(-MAX_HISTORY), prev]);
                setFuture([]);
                return next;
            });
        },
        []
    );

    // ── 1. Add Child ──────────────────────────────────────────────────────────
    const addChild = useCallback(
        (parentId: string) => {
            const newId = generateId();
            commit((prev) => {
                if (!prev[parentId]) return prev;
                return {
                    ...prev,
                    [parentId]: {
                        ...prev[parentId],
                        children: [...prev[parentId].children, newId],
                        collapsed: false, // auto-expand parent on add
                    },
                    [newId]: {
                        id: newId,
                        label: "New Node",
                        parentId,
                        children: [],
                        collapsed: false,
                    },
                };
            });
        },
        [commit]
    );

    // ── 2. Recursive Delete ───────────────────────────────────────────────────
    const deleteNode = useCallback(
        (id: string) => {
            commit((prev) => {
                const node = prev[id];
                if (!node) return prev;
                if (node.parentId === null && Object.keys(prev).length === 1) {
                    // Never delete the last root
                    return prev;
                }

                const toRemove = new Set(getDescendants(prev, id));
                const next: TreeState = {};

                for (const [k, v] of Object.entries(prev)) {
                    if (!toRemove.has(k)) {
                        next[k] = {
                            ...v,
                            // Remove deleted child references
                            children: v.children.filter((c) => !toRemove.has(c)),
                        };
                    }
                }
                return next;
            });
        },
        [commit]
    );

    // ── 3. Toggle Collapse ────────────────────────────────────────────────────
    const toggleCollapse = useCallback(
        (id: string) => {
            commit((prev) => {
                if (!prev[id]) return prev;
                return {
                    ...prev,
                    [id]: { ...prev[id], collapsed: !prev[id].collapsed },
                };
            });
        },
        [commit]
    );

    // ── 4. Edit Label ─────────────────────────────────────────────────────────
    const updateLabel = useCallback(
        (id: string, label: string) => {
            setTree((prev) => {
                if (!prev[id] || prev[id].label === label) return prev;
                return { ...prev, [id]: { ...prev[id], label } };
            });
            // Note: label edits do NOT push to undo stack individually —
            // they are batched via the final "blur" commit done in CustomNode.
        },
        []
    );

    /**
     * Commit a label change to the undo stack (called on input blur).
     */
    const commitLabel = useCallback(
        (id: string, label: string) => {
            commit((prev) => {
                if (!prev[id]) return prev;
                return { ...prev, [id]: { ...prev[id], label } };
            });
        },
        [commit]
    );

    // ── 5. Re-parent (Drag & Drop) ────────────────────────────────────────────
    const reparentNode = useCallback(
        (nodeId: string, newParentId: string) => {
            commit((prev) => {
                const node = prev[nodeId];
                if (!node) return prev;
                if (nodeId === newParentId) return prev;
                if (node.parentId === newParentId) return prev;
                // Cycle prevention: cannot drop into own subtree
                if (isDescendant(prev, nodeId, newParentId)) return prev;

                const next = { ...prev };

                // Remove from old parent
                if (node.parentId && next[node.parentId]) {
                    next[node.parentId] = {
                        ...next[node.parentId],
                        children: next[node.parentId].children.filter((c) => c !== nodeId),
                    };
                }

                // Add to new parent
                next[newParentId] = {
                    ...next[newParentId],
                    children: [...next[newParentId].children, nodeId],
                    collapsed: false,
                };

                // Update moved node
                next[nodeId] = { ...node, parentId: newParentId };

                return next;
            });
        },
        [commit]
    );

    // ── 6. Undo / Redo ────────────────────────────────────────────────────────
    const undo = useCallback(() => {
        setPast((p) => {
            if (p.length === 0) return p;
            const prev = p[p.length - 1];
            const rest = p.slice(0, -1);
            setFuture((f) => [tree, ...f]);
            setTree(prev);
            return rest;
        });
    }, [tree]);

    const redo = useCallback(() => {
        setFuture((f) => {
            if (f.length === 0) return f;
            const next = f[0];
            const rest = f.slice(1);
            setPast((p) => [...p, tree]);
            setTree(next);
            return rest;
        });
    }, [tree]);

    // ── 7. Load / Export / Save ───────────────────────────────────────────────
    const loadTree = useCallback((payload: BackendTreePayload) => {
        setTree(payload.nodes);
        setPast([]);
        setFuture([]);
    }, []);

    const exportTree = useCallback((): BackendTreePayload => {
        return { nodes: tree };
    }, [tree]);

    const persistTree = useCallback(async () => {
        const errors = validateTree(tree);
        if (errors.length > 0) {
            console.warn("[useTree] Tree validation errors:", errors);
        }
        await saveTree(tree);
    }, [tree]);

    return {
        tree,
        addChild,
        deleteNode,
        toggleCollapse,
        updateLabel,
        commitLabel,
        reparentNode,
        undo,
        redo,
        canUndo: past.length > 0,
        canRedo: future.length > 0,
        loadTree,
        exportTree,
        persistTree,
    };
}
