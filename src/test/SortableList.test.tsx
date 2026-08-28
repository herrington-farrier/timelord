import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SortableList } from '../components/SortableList';

describe('SortableList', () => {
  it('exposes a drag handle instead of a weight field', () => {
    render(
      <SortableList ids={['house', 'garden']} onReorder={() => undefined}>
        {(id) => <span>{id}</span>}
      </SortableList>
    );
    expect(screen.getAllByLabelText('Drag to reorder')).toHaveLength(2);
    expect(screen.queryByLabelText(/weight|priority/i)).toBeNull();
  });
});
