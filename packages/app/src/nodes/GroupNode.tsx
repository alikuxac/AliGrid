import React, { useState, memo } from 'react';
import { NodeResizer } from 'reactflow';
import { useStore } from '../store';

export interface GroupNodeProps {
    id: string;
    type: string;
    data: {
        label?: string;
        color?: string;
        isLocked?: boolean;
        width?: number;
        height?: number;
    };
    selected?: boolean;
}

const PRESET_COLORS = [
    { name: 'Default', value: 'rgba(22, 27, 46, 0.5)' },
    { name: 'Red', value: 'rgba(239, 68, 68, 0.2)' },
    { name: 'Green', value: 'rgba(16, 185, 129, 0.2)' },
    { name: 'Blue', value: 'rgba(59, 130, 246, 0.2)' },
    { name: 'Yellow', value: 'rgba(245, 158, 11, 0.2)' },
    { name: 'Purple', value: 'rgba(139, 92, 246, 0.2)' },
];

export const GroupNode: React.FC<GroupNodeProps> = memo(({ id, data, selected }) => {
    const updateNodeData = useStore((state) => state.updateNodeData);
    const [isEditing, setIsEditing] = useState(false);
    const [title, setTitle] = useState(data.label || 'Group Area');
    const [showColors, setShowColors] = useState(false);

    const bgColor = data.color || 'rgba(22, 27, 46, 0.5)';
    const isLocked = data.isLocked || false;

    const handleColorClick = (color: string) => {
        updateNodeData(id, { color });
        setShowColors(false);
    };

    const handleLockToggle = () => {
        const nextLocked = !isLocked;
        updateNodeData(id, { isLocked: nextLocked });

        // Also update the draggable property in the node itself directly via state
        const state = useStore.getState();
        const nodes = state.nodes.map((n) =>
            n.id === id ? { ...n, draggable: !nextLocked } : n
        );
        useStore.setState({ nodes });
    };

    const handleTitleBlur = () => {
        setIsEditing(false);
        updateNodeData(id, { label: title });
    };

    const handleTitleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleTitleBlur();
        }
    };

    return (
        <div className="group-node-container" style={{
            background: bgColor,
            border: `2px ${selected ? 'solid' : 'dashed'} ${selected ? '#3b82f6' : 'rgba(148, 163, 184, 0.4)'}`,
            borderRadius: '8px',
            width: '100%',
            height: '100%',
            position: 'relative',
            fontFamily: 'monospace',
            transition: 'border-color 0.2s',
            pointerEvents: 'none' // Let clicks pass through the body to edges/nodes behind it
        }}>
            <div style={{ pointerEvents: 'all' }}>
                <NodeResizer
                    minWidth={150}
                    minHeight={100}
                    isVisible={selected && !isLocked}
                    lineClassName="border-blue-400"
                    handleClassName="h-3 w-3 bg-white border-2 border-blue-400 rounded"
                />
            </div>

            {/* Header */}
            <div className="group-node-header" style={{
                background: 'rgba(15, 23, 42, 0.6)',
                padding: '8px 12px',
                borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
                borderTopLeftRadius: '6px',
                borderTopRightRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                pointerEvents: 'all', // make sure header elements can be clicked
                cursor: isLocked ? 'default' : 'move' // Header is draggable
            }}>
                {isEditing ? (
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={handleTitleBlur}
                        onKeyDown={handleTitleKeyDown}
                        autoFocus
                        style={{
                            background: '#1e293b',
                            border: '1px solid #3b82f6',
                            color: 'white',
                            borderRadius: '4px',
                            padding: '2px 4px',
                            fontSize: '12px',
                            width: '120px',
                            outline: 'none'
                        }}
                    />
                ) : (
                    <span
                        onClick={() => !isLocked && setIsEditing(true)}
                        style={{
                            fontWeight: 'bold',
                            fontSize: '12px',
                            color: '#e2e8f0',
                            cursor: isLocked ? 'default' : 'pointer'
                        }}
                    >
                        {title}
                        {isLocked && <span style={{ marginLeft: '4px', fontSize: '10px' }}>🔒</span>}
                    </span>
                )}

                {/* Toolbar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Compact Color Picker */}
                    {!isLocked && (
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowColors(!showColors);
                                }}
                                title="Change Background Color"
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#94a3b8',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    padding: '2px',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                            >
                                🎨
                            </button>
                            {showColors && (
                                <div style={{
                                    position: 'absolute',
                                    top: '24px',
                                    right: 0,
                                    display: 'flex',
                                    gap: '6px',
                                    background: '#1e293b',
                                    border: '1px solid rgba(148, 163, 184, 0.2)',
                                    padding: '6px',
                                    borderRadius: '6px',
                                    zIndex: 30,
                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.5)'
                                }}>
                                    {PRESET_COLORS.map((c) => (
                                        <button
                                            key={c.value}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleColorClick(c.value);
                                            }}
                                            title={c.name}
                                            style={{
                                                width: '12px',
                                                height: '12px',
                                                borderRadius: '50%',
                                                background: c.value,
                                                border: '1px solid rgba(255,255,255,0.3)',
                                                cursor: 'pointer',
                                                padding: 0
                                            }}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Lock Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleLockToggle();
                        }}
                        title={isLocked ? 'Unlock position' : 'Lock position'}
                        style={{
                            background: isLocked ? '#f43f5e30' : '#1e293b',
                            border: `1px solid ${isLocked ? '#f43f5e' : 'rgba(148, 163, 184, 0.2)'}`,
                            color: 'white',
                            padding: '2px 4px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '22px',
                            height: '22px'
                        }}
                    >
                        <span>{isLocked ? '🔒' : '🔓'}</span>
                    </button>
                </div>
            </div>

            {/* Background Content Area */}
            <div style={{
                position: 'absolute',
                top: '36px',
                bottom: 0,
                left: 0,
                right: 0,
                pointerEvents: 'none' // Allow clicking through to underlying nodes
            }} />
        </div>
    );
});
