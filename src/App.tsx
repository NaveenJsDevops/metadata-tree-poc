// ─── App.tsx — Root Orchestrator ──────────────────────────────────────────────
//
// Layout: Toolbar → React Flow Canvas → Stats Bar
//
// Architecture notes:
//   • useTree is the SINGLE SOURCE OF TRUTH — React Flow is purely a renderer.
//   • treeToFlow() + applyLayout() derive RF nodes/edges on every tree change.
//   • Drag & Drop re-parenting uses React Flow's onNodeDragStop event.
//   • nodeTypes is stable (defined outside component) to avoid re-mount.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from "reactflow";
import type { NodeDragHandler } from "reactflow";
import "reactflow/dist/style.css";
import "./index.css";

import CustomNode from "./components/CustomNode";
import { useTree } from "./hooks/useTree";
import { treeToFlow } from "./utils/treeToFlow";
import { applyLayout } from "./utils/layout";
import { fetchTree } from "./services/api";
import type { TreeState } from "./types/tree";

// ─── Stable node type map (must live outside component) ───────────────────────
const NODE_TYPES = { custom: CustomNode };

// ─── Initial empty-tree placeholder shown while fetchTree() resolves ──────────
const EMPTY_TREE: TreeState = {};

// ─── Toast helper type ────────────────────────────────────────────────────────
type Toast = { msg: string; kind: "success" | "error" };

export default function App() {
  // ── 1. Load tree from mock API on mount ─────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [initialTree, setInitialTree] = useState<TreeState>(EMPTY_TREE);

  useEffect(() => {
    fetchTree()
      .then((payload) => setInitialTree(payload.nodes))
      .finally(() => setLoading(false));
  }, []);

  // ── 2. Business logic hook ───────────────────────────────────────────────────
  const {
    tree,
    addChild,
    deleteNode,
    toggleCollapse,
    commitLabel,
    reparentNode,
    undo,
    redo,
    canUndo,
    canRedo,
    exportTree,
    persistTree,
    loadTree,
  } = useTree(initialTree);

  // Sync initial tree once loaded
  useEffect(() => {
    if (!loading && Object.keys(initialTree).length > 0) {
      loadTree({ nodes: initialTree });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, initialTree]);

  // ── 3. React Flow state (derived — never mutated directly) ───────────────────
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // ── 4. Stable handlers (passed through node data) ────────────────────────────
  const handlers = useMemo(
    () => ({
      onAddChild: addChild,
      onDelete: deleteNode,
      onToggleCollapse: toggleCollapse,
      onLabelChange: (id: string, label: string) => {
        // Use commitLabel (undo-stack version) since CustomNode calls this on blur
        commitLabel(id, label);
      },
    }),
    [addChild, deleteNode, toggleCollapse, commitLabel]
  );

  // ── 5. Derive + layout RF nodes/edges whenever tree changes ─────────────────
  useEffect(() => {
    if (loading) return;
    const { nodes: rfNodes, edges: rfEdges } = treeToFlow(tree, handlers);
    const laidOut = applyLayout(rfNodes, rfEdges);
    setNodes(laidOut);
    setEdges(rfEdges);
  }, [tree, handlers, loading, setNodes, setEdges]);

  // ── 6. Drag & Drop re-parenting ──────────────────────────────────────────────
  // We use onNodeDragStop: when a node is dropped, find the closest node under it
  // that is NOT in its own subtree and treat it as the new parent.
  const onNodeDragStop: NodeDragHandler = useCallback(
    (_event, _draggedNode, draggedNodes) => {
      // We support single-node drag only
      if (draggedNodes.length !== 1) return;
      const dragged = draggedNodes[0];

      // Find the node with the biggest intersection area under the dragged node
      setNodes((currentNodes) => {
        const draggedRF = currentNodes.find((n) => n.id === dragged.id);
        if (!draggedRF) return currentNodes;

        const dX = draggedRF.position.x;
        const dY = draggedRF.position.y;
        const dW = (draggedRF.style?.width as number) ?? 240;
        const dH = (draggedRF.style?.height as number) ?? 130;

        let bestId: string | null = null;
        let bestScore = 0;

        for (const n of currentNodes) {
          if (n.id === dragged.id) continue;
          const nX = n.position.x;
          const nY = n.position.y;
          const nW = (n.style?.width as number) ?? 240;
          const nH = (n.style?.height as number) ?? 130;

          const overlapX = Math.max(
            0,
            Math.min(dX + dW, nX + nW) - Math.max(dX, nX)
          );
          const overlapY = Math.max(
            0,
            Math.min(dY + dH, nY + nH) - Math.max(dY, nY)
          );
          const score = overlapX * overlapY;
          if (score > bestScore) {
            bestScore = score;
            bestId = n.id;
          }
        }

        if (bestId && bestScore > 500) {
          reparentNode(dragged.id, bestId);
        }

        return currentNodes; // tree update triggers re-layout anyway
      });
    },
    [reparentNode, setNodes]
  );

  // ── 7. Keyboard shortcuts (Ctrl+Z / Ctrl+Y / Delete) ───────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement;
      const isInput =
        active?.tagName === "INPUT" || active?.tagName === "TEXTAREA";

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (
        ((e.metaKey || e.ctrlKey) && e.key === "y") ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z")
      ) {
        e.preventDefault();
        redo();
      }
      if (e.key === "Delete" && !isInput) {
        // Delete the selected node(s)
        nodes
          .filter((n) => n.selected)
          .forEach((n) => deleteNode(n.id));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, deleteNode, nodes]);

  // ── 8. Save / Export actions ─────────────────────────────────────────────────
  const [toast, setToast] = useState<Toast | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, kind: Toast["kind"]) => {
    setToast({ msg, kind });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const handleSave = useCallback(async () => {
    setSaveStatus("saving");
    try {
      await persistTree();
      setSaveStatus("saved");
      showToast("Tree saved successfully!", "success");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("idle");
      showToast("Save failed. Please try again.", "error");
    }
  }, [persistTree, showToast]);

  const handleExport = useCallback(() => {
    const payload = exportTree();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "metadata-tree.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Exported as metadata-tree.json", "success");
  }, [exportTree, showToast]);

  const handleImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const payload = JSON.parse(ev.target?.result as string);
          if (payload?.nodes) {
            loadTree(payload);
            showToast("Tree imported successfully!", "success");
          } else {
            showToast("Invalid JSON: missing 'nodes' key.", "error");
          }
        } catch {
          showToast("Failed to parse JSON file.", "error");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [loadTree, showToast]);

  // ── 9. Stats ──────────────────────────────────────────────────────────────────
  const nodeCount = Object.keys(tree).length;
  const visibleCount = nodes.length;
  const edgeCount = edges.length;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      {/* Loading overlay */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <span className="loading-text">Loading tree data…</span>
        </div>
      )}

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <header className="toolbar" role="banner">
        <div className="toolbar__brand">
          🌳 <span>Metadata</span> Tree Builder
        </div>
        <div className="toolbar__sep" />

        {/* Undo / Redo */}
        <button
          id="btn-undo"
          className="tb-btn"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          ↩ Undo
        </button>
        <button
          id="btn-redo"
          className="tb-btn"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
        >
          ↪ Redo
        </button>

        <div className="toolbar__sep" />

        {/* I/O */}
        <button
          id="btn-import"
          className="tb-btn"
          onClick={handleImport}
          title="Import JSON file"
        >
          📂 Import
        </button>
        <button
          id="btn-export"
          className="tb-btn"
          onClick={handleExport}
          title="Export tree as JSON"
        >
          📤 Export
        </button>

        <div className="toolbar__sep" />

        {/* Save */}
        <button
          id="btn-save"
          className="tb-btn tb-btn--success"
          onClick={handleSave}
          disabled={saveStatus === "saving"}
          title="Save to server (Ctrl+S)"
        >
          {saveStatus === "saving" ? "⏳ Saving…" : "💾 Save"}
        </button>

        <div className="toolbar__spacer" />

        {/* Save status */}
        <div
          className={`status-pill${saveStatus === "saving" ? " saving" : saveStatus === "saved" ? " saved" : ""}`}
        >
          <span
            className={`status-dot${saveStatus === "saving" ? " pulse" : ""}`}
          />
          {saveStatus === "saving"
            ? "Saving…"
            : saveStatus === "saved"
              ? "Saved"
              : "Ready"}
        </div>
      </header>

      {/* ── React Flow Canvas ─────────────────────────────────────────────────── */}
      <main className="flow-container">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <MiniMap
            nodeColor="#6366f1"
            maskColor="rgba(13, 13, 26, 0.75)"
          />
          <Controls showInteractive={false} />
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="rgba(99, 102, 241, 0.15)"
          />
        </ReactFlow>
      </main>

      {/* ── Stats Bar ─────────────────────────────────────────────────────────── */}
      <footer className="stats-bar" role="contentinfo">
        <span>
          Total nodes: <strong>{nodeCount}</strong>
        </span>
        <span>
          Visible: <strong>{visibleCount}</strong>
        </span>
        <span>
          Edges: <strong>{edgeCount}</strong>
        </span>
        <span className="stats-bar__hint">
          Drag a node onto another to re-parent • Ctrl+Z / Ctrl+Y to undo/redo •
          Delete key removes selected nodes
        </span>
      </footer>

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`toast toast--${toast.kind}`}
          role="alert"
          aria-live="polite"
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}