import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { Tabs } from './Tabs';

const tabs = [
  { id: 'one', label: 'One', content: 'First panel' },
  { id: 'two', label: 'Two', content: 'Second panel' },
  { id: 'three', label: 'Three', content: 'Third panel' },
];

function renderTabs(dir: 'ltr' | 'rtl') {
  return renderWithProviders(
    <div dir={dir} style={{ direction: dir }}>
      <Tabs label="Lesson" tabs={tabs} />
    </div>,
  );
}

describe('Tabs', () => {
  it('links each tab to its panel and shows only the selected one', () => {
    renderTabs('ltr');

    const first = screen.getByRole('tab', { name: 'One' });
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('First panel');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('One');
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves with the arrow keys and wraps around in left-to-right pages', async () => {
    const user = userEvent.setup();
    renderTabs('ltr');

    await user.click(screen.getByRole('tab', { name: 'One' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Second panel');

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveAttribute('aria-selected', 'true');
  });

  it('reverses the arrow keys in right-to-left pages', async () => {
    const user = userEvent.setup();
    renderTabs('rtl');

    await user.click(screen.getByRole('tab', { name: 'One' }));
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true');
  });

  it('jumps to the ends with Home and End', async () => {
    const user = userEvent.setup();
    renderTabs('ltr');

    await user.click(screen.getByRole('tab', { name: 'One' }));
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus();
  });
});
