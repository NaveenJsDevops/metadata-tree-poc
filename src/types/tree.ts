// ─── Core Tree Data Model ─────────────────────────────────────────────────────

export type TreeNode = {
    id: string;
    label: string;
    parentId: string | null;
    children: string[];
    collapsed?: boolean;
};

/** Normalized tree state — O(1) lookup */
export type TreeState = Record<string, TreeNode>;

// ─── Backend JSON Format ───────────────────────────────────────────────────────

export type BackendTreePayload = {
    nodes: TreeState;
};

// ─── History for Undo / Redo ──────────────────────────────────────────────────

export type HistoryEntry = {
    tree: TreeState;
    timestamp: number;
};
