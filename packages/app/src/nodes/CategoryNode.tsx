import React from 'react';

export interface CategoryNodeProps {
    data: {
        label: string;
        width: number;
        height: number;
        color?: string;
    };
}

export const CategoryNode: React.FC<CategoryNodeProps> = ({ data }) => {
    const bgColor = data?.color || 'rgba(200, 200, 200, 0.2)';

    return (
        <div
            style={{
                width: data?.width ?? 300,
                height: data?.height ?? 300,
                backgroundColor: bgColor,
                border: '1px dashed #64748b',
                borderRadius: '8px',
                padding: '10px',
                boxSizing: 'border-box',
                pointerEvents: 'none', // Critical so standard nodes inside can be clicked/dragged over it. Set to auto on header maybe
            }}
        >
            <div
                className="custom-drag-handle"
                style={{
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: '#334155',
                    marginBottom: '10px',
                    pointerEvents: 'auto', // Allow dragging on header
                    display: 'inline-block',
                    background: 'rgba(255,255,255,0.7)',
                    padding: '2px 8px',
                    borderRadius: '4px'
                }}
            >
                {data?.label || 'Group'}
            </div>
            {/* Category nodes don't have handles since they're just visual containers */}
        </div>
    );
};
