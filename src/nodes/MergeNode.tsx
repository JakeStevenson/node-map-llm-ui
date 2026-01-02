import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { MergeIcon } from '../components/icons';

export interface MergeNodeData extends Record<string, unknown> {
  isActive: boolean;
  isOnActivePath: boolean;
  isSelected: boolean;
  parentCount: number;
}

export type MergeNodeType = Node<MergeNodeData, 'merge'>;

function MergeNodeComponent({ data, selected }: NodeProps<MergeNodeType>): JSX.Element {
  const { isActive, isOnActivePath, isSelected, parentCount } = data;

  return (
    <>
      {/* Input handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-amber-400 !w-2 !h-2"
      />

      {/* Circular merge node */}
      <div
        className={`
          relative w-10 h-10 cursor-pointer
          transition-all duration-150
          ${isSelected || isOnActivePath || isActive ? 'opacity-100' : 'opacity-50'}
          ${selected ? 'scale-110' : 'hover:scale-105'}
        `}
      >
        {/* Circle background - matches sidebar summary boxes */}
        <div
          className={`
            absolute inset-0 rounded-full
            bg-amber-400/20 border-2 border-amber-400/50
            ${isSelected
              ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-[var(--color-background)]'
              : isActive
              ? 'ring-2 ring-amber-500 ring-offset-2 ring-offset-[var(--color-background)]'
              : ''
            }
            ${selected ? 'shadow-lg shadow-amber-500/30' : 'shadow-md'}
          `}
        />

        {/* Merge icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <MergeIcon size={18} strokeWidth={2.5} className="text-amber-500" />
        </div>

        {/* Parent count badge */}
        {parentCount > 0 && (
          <div className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 bg-amber-500 text-white text-[10px] font-bold rounded-full border-2 border-[var(--color-background)]">
            {parentCount}
          </div>
        )}
      </div>

      {/* Output handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-amber-400 !w-2 !h-2"
      />
    </>
  );
}

export const MergeNode = memo(MergeNodeComponent);
