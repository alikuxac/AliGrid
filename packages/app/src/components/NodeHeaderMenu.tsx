import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';

interface NodeHeaderMenuProps {
    nodeId: string;
}

export const NodeHeaderMenu: React.FC<NodeHeaderMenuProps> = ({ nodeId }) => {
    const isViewOnly = useStore((state) => (state as any).isViewOnly);
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    if (isViewOnly) return null;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm("Are you sure you want to delete this node?")) {
            const state = useStore.getState();
            state.onNodesChange([{ type: 'remove', id: nodeId }]);
        }
        setIsOpen(false);
    };

    return (
        <div style={{ position: 'relative' }} ref={menuRef} className="nodrag">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    fontSize: '14px'
                }}
                onMouseOver={(e) => e.currentTarget.style.color = '#f8fafc'}
                onMouseOut={(e) => e.currentTarget.style.color = '#94a3b8'}
            >
                ⋮
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '4px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.5)',
                    zIndex: 50,
                    width: '100px',
                    overflow: 'hidden'
                }}>
                    <button
                        onClick={handleDelete}
                        style={{
                            width: '100%',
                            padding: '6px 12px',
                            background: 'transparent',
                            border: 'none',
                            color: '#f87171',
                            textAlign: 'left',
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: 'bold'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        🗑️ Delete
                    </button>
                </div>
            )}
        </div>
    );
};
