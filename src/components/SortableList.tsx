import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReactNode } from 'react';

function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      className="sortable-row"
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button type="button" className="drag-handle" aria-label="Drag to reorder" {...attributes} {...listeners}>
        ⋮⋮
      </button>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

type Props = {
  ids: string[];
  onReorder: (ids: string[]) => void;
  children: (id: string) => ReactNode;
};

export function SortableList({ ids, onReorder, children }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    onReorder(arrayMove(ids, oldIndex, newIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {ids.map((id) => (
          <SortableRow key={id} id={id}>
            {children(id)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  );
}
