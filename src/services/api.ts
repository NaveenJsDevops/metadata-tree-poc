// ─── Mock API Layer ────────────────────────────────────────────────────────────
// Simulates async API calls with setTimeout.
// Replace the internals with real fetch() calls when connecting to a backend.

import type { BackendTreePayload, TreeState } from "../types/tree";

const MOCK_DELAY = 400;

/** Simulated default tree returned by the server */
const DEFAULT_TREE: TreeState = {
    "1": { id: "1", label: "Root", parentId: null, children: ["2", "3"] },
    "2": { id: "2", label: "Config", parentId: "1", children: ["4", "5"] },
    "3": { id: "3", label: "Metadata", parentId: "1", children: ["6"] },
    "4": { id: "4", label: "Database", parentId: "2", children: [] },
    "5": { id: "5", label: "Cache", parentId: "2", children: [] },
    "6": { id: "6", label: "Schema", parentId: "3", children: ["7", "8"] },
    "7": { id: "7", label: "Fields", parentId: "6", children: [] },
    "8": { id: "8", label: "Relations", parentId: "6", children: [] },
};

/**
 * Fetch the initial tree from the server.
 */
export async function fetchTree(): Promise<BackendTreePayload> {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({ nodes: structuredClone(DEFAULT_TREE) });
        }, MOCK_DELAY);
    });
}

/**
 * Persist the current tree state to the server.
 */
export async function saveTree(tree: TreeState): Promise<{ success: boolean }> {
    return new Promise((resolve) => {
        setTimeout(() => {
            console.log("[API] Tree saved:", tree);
            resolve({ success: true });
        }, MOCK_DELAY);
    });
}
