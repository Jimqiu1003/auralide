import type { Element, Slide, SlideSize } from '@auralide/core';
import type { JSX, PointerEvent } from 'react';

export function SlideArtwork({
  slide,
  size,
  selectedId,
  drag,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onEdit,
}: {
  slide: Slide;
  size: SlideSize;
  selectedId?: string;
  drag?: { id: string; x: number; y: number } | null;
  onSelect?: (element: Element) => void;
  onPointerDown?: (event: PointerEvent<SVGGElement>, element: Element) => void;
  onPointerMove?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerCancel?: () => void;
  onEdit?: () => void;
}): JSX.Element {
  const interactive = onSelect !== undefined;
  return (
    <svg
      viewBox={`0 0 ${size.width} ${size.height}`}
      role={interactive ? 'group' : 'img'}
      aria-label={slide.name ?? '幻灯片'}
      className={interactive ? 'slide-preview' : 'thumbnail-artwork'}
      data-testid={interactive ? 'slide-preview' : undefined}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <rect width={size.width} height={size.height} fill={slide.backgroundColor ?? '#ffffff'} />
      {slide.elements.map((item) => {
        const { width, height } = item.geometry;
        const x = drag?.id === item.id ? drag.x : item.geometry.x;
        const y = drag?.id === item.id ? drag.y : item.geometry.y;
        return (
          <g
            key={item.id}
            data-element-id={interactive ? item.id : undefined}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={
              interactive
                ? (item.name ??
                  (item.kind === 'text' ? item.text.slice(0, 40) || '空文本' : '形状'))
                : undefined
            }
            aria-pressed={interactive ? selectedId === item.id : undefined}
            className={interactive ? 'canvas-object' : undefined}
            onPointerDown={(event) => onPointerDown?.(event, item)}
            onDoubleClick={() => {
              onSelect?.(item);
              if (item.kind === 'text') onEdit?.();
            }}
            onKeyDown={(event) => {
              if (interactive && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                onSelect(item);
              }
            }}
          >
            <g
              opacity={item.opacity ?? 1}
              transform={`rotate(${item.rotation ?? 0} ${x + width / 2} ${y + height / 2})`}
            >
              {item.kind === 'text' ? (
                <foreignObject x={x} y={y} width={width} height={height}>
                  <div
                    className="slide-text"
                    data-testid={interactive ? 'slide-text' : undefined}
                    style={{
                      fontSize: item.style?.fontSize ?? 32,
                      fontWeight: item.style?.fontWeight ?? 400,
                      color: item.style?.color ?? '#172033',
                      textAlign: item.style?.align ?? 'left',
                    }}
                  >
                    {item.text}
                  </div>
                </foreignObject>
              ) : item.kind === 'shape' ? (
                item.shape === 'ellipse' ? (
                  <ellipse
                    cx={x + width / 2}
                    cy={y + height / 2}
                    rx={width / 2}
                    ry={height / 2}
                    fill={item.fill ?? '#4677e8'}
                    stroke={item.stroke ?? 'none'}
                  />
                ) : item.shape === 'line' ? (
                  <line
                    x1={x}
                    y1={y}
                    x2={x + width}
                    y2={y + height}
                    stroke={item.stroke ?? item.fill ?? '#4677e8'}
                    strokeWidth="4"
                  />
                ) : (
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={item.fill ?? '#4677e8'}
                    stroke={item.stroke ?? 'none'}
                  />
                )
              ) : (
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill="#e6e9ee"
                  stroke="#737e8e"
                  strokeDasharray="12 8"
                />
              )}
            </g>
            {interactive && (
              <>
                <rect
                  className={selectedId === item.id ? 'selection-halo' : 'focus-halo'}
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                />
                <rect
                  className={selectedId === item.id ? 'selection-outline' : 'focus-outline'}
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
