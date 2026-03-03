// ─── Custom Node Component ────────────────────────────────────────────────────
// Wrapped in React.memo — only re-renders when its data props change.

import React, { useState, useCallback, useRef } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import "./CustomNode.css";

type CustomNodeData = {
    label: string;
    collapsed: boolean;
    hasChildren: boolean;
    onAddChild: (id: string) => void;
    onDelete: (id: string) => void;
    onToggleCollapse: (id: string) => void;
    onLabelChange: (id: string, label: string) => void;
};

const CustomNode = React.memo(
    ({ id, data, selected }: NodeProps<CustomNodeData>) => {
        const [localLabel, setLocalLabel] = useState(data.label);
        const prevLabelRef = useRef(data.label);

        // Sync external label changes (e.g. from undo/redo) without breaking local edits
        if (data.label !== prevLabelRef.current) {
            prevLabelRef.current = data.label;
            setLocalLabel(data.label);
        }

        const handleLabelChange = useCallback(
            (e: React.ChangeEvent<HTMLInputElement>) => {
                const val = e.target.value;
                setLocalLabel(val);
                data.onLabelChange(id, val); // live update (no undo-stack commit)
            },
            [id, data]
        );

        // Commit to undo stack only on blur
        const handleLabelBlur = useCallback(() => {
            data.onLabelChange(id, localLabel);
        }, [id, localLabel, data]);

        // Keyboard: Enter blurs the input
        const handleKeyDown = useCallback(
            (e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Delete" || e.key === "Backspace") {
                    // Prevent node deletion while editing label
                    e.stopPropagation();
                }
            },
            []
        );

        const handleAddChild = useCallback(() => data.onAddChild(id), [id, data]);
        const handleDelete = useCallback(() => data.onDelete(id), [id, data]);
        const handleToggle = useCallback(
            () => data.onToggleCollapse(id),
            [id, data]
        );

        const collapseIcon = data.collapsed ? "▶" : "▼";
        const childCount = data.hasChildren
            ? data.collapsed
                ? " (hidden)"
                : ""
            : "";

        return (
            <div className={`custom-node${selected ? " selected" : ""}`}>
                {/* Top handle — receives edges from parent */}
                <Handle type="target" position={Position.Top} />

                {/* Header: collapse toggle + label input */}
                <div className="custom-node__header">
                    <button
                        className={`custom-node__collapse-btn${!data.hasChildren ? " no-children" : ""}`}
                        onClick={handleToggle}
                        title={data.collapsed ? "Expand" : "Collapse"}
                        tabIndex={-1}
                    >
                        {collapseIcon}
                    </button>
                    <input
                        className="custom-node__label-input nodrag"
                        value={localLabel}
                        onChange={handleLabelChange}
                        onBlur={handleLabelBlur}
                        onKeyDown={handleKeyDown}
                        title="Click to edit label"
                        placeholder="Node label…"
                    />
                </div>

                {/* Node metadata */}
                <div className="custom-node__meta">
                    ID: {id.slice(0, 8)}{childCount}
                </div>

                {/* Action buttons */}
                <div className="custom-node__actions">
                    <button
                        className="custom-node__btn custom-node__btn--add"
                        onClick={handleAddChild}
                        title="Add child node"
                    >
                        ＋ Add Child
                    </button>
                    <button
                        className="custom-node__btn custom-node__btn--delete"
                        onClick={handleDelete}
                        title="Delete node and descendants"
                    >
                        ✕ Delete
                    </button>
                </div>

                {/* Bottom handle — connects to children */}
                <Handle type="source" position={Position.Bottom} />

                {/* Collapsed badge */}
                {data.collapsed && data.hasChildren && (
                    <div className="custom-node__collapsed-badge">
                        {`COLLAPSED`}
                    </div>
                )}
            </div>
        );
    }
);

CustomNode.displayName = "CustomNode";

export default CustomNode;