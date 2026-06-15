import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppMenuItem, SectionId } from '../types/navigation';
import { ToastProvider } from './ToastProvider';
import SecondaryMenuPage from './SecondaryMenuPage';

function renderPage(menuItem: AppMenuItem, onNavigate = vi.fn<(section: SectionId) => void>()) {
  render(
    <ToastProvider>
      <SecondaryMenuPage menuItem={menuItem} onNavigate={onNavigate} />
    </ToastProvider>,
  );
  return { onNavigate };
}

describe('SecondaryMenuPage', () => {
  it('navigates to implemented child entries', () => {
    const { onNavigate } = renderPage({
      id: 'bid-generation',
      label: '标书生成',
      description: '技术方案与商务标编制',
      children: [
        {
          id: 'technical-plan',
          label: '生成技术方案',
          description: '根据招标文件重头编写一份标书',
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: /生成技术方案/ }));

    expect(onNavigate).toHaveBeenCalledWith('technical-plan');
  });

  it('shows a toast instead of navigating when the child entry is gated', async () => {
    const { onNavigate } = renderPage({
      id: 'knowledge-base',
      label: '知识库',
      description: '素材、模板和案例资产',
      children: [
        {
          id: 'image-knowledge-base',
          label: '图片知识库',
          description: '管理图片素材、图示和视觉参考资料',
          notice: {
            message: '正在开发中，在github给作者点个star，可以加速开发。',
            actionLabel: '点此直达',
            externalUrl: 'https://github.com/FB208/OpenBidKit_Yibiao',
          },
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: /图片知识库/ }));

    expect(onNavigate).not.toHaveBeenCalled();
    expect(await screen.findByText(/正在开发中/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '点此直达' })).toBeInTheDocument();
  });
});
