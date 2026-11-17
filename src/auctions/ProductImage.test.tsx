import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductImage } from './ProductImage';

describe('product picture', () => {
  it('shows a skeleton until the picture has downloaded, then fades the picture in', () => {
    render(<ProductImage url="https://img.example/phone.jpg" alt="A phone" className="h-16 w-16" />);
    const picture = screen.getByRole('img', { name: 'A phone' });
    expect(screen.getByTestId('image-skeleton')).toBeInTheDocument();
    expect(picture).toHaveClass('opacity-0');

    fireEvent.load(picture);

    expect(screen.queryByTestId('image-skeleton')).not.toBeInTheDocument();
    expect(picture).toHaveClass('opacity-100');
  });

  it('shows the no-picture placeholder for a link that is broken or not http(s)', () => {
    const { rerender } = render(<ProductImage url="https://img.example/gone.jpg" alt="A phone" />);
    fireEvent.error(screen.getByRole('img', { name: 'A phone' }));
    expect(screen.queryByTestId('image-skeleton')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'A phone' }).tagName).toBe('DIV');

    rerender(<ProductImage url="javascript:alert(1)" alt="A phone" />);
    expect(screen.getByRole('img', { name: 'A phone' }).tagName).toBe('DIV');
  });
});
