import React, { useMemo, useRef, useState } from 'react';

export interface VirtualWindowResult {
  startIndex: number;
  endIndex: number;
  topSpacerPx: number;
  bottomSpacerPx: number;
  totalHeightPx: number;
}

/**
 * Pure windowing math so both React components and unit tests can verify exact
 * visible ranges without external virtualization dependencies.
 */
export function computeVirtualWindow(params: {
  itemCount: number;
  itemHeightPx: number;
  scrollTopPx: number;
  viewportHeightPx: number;
  overscanCount?: number;
}): VirtualWindowResult {
  const {
    itemCount,
    itemHeightPx,
    scrollTopPx,
    viewportHeightPx,
    overscanCount = 3,
  } = params;

  if (itemCount <= 0 || itemHeightPx <= 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      topSpacerPx: 0,
      bottomSpacerPx: 0,
      totalHeightPx: 0,
    };
  }

  const safeScrollTop = Math.max(0, scrollTopPx);
  const safeViewport = Math.max(itemHeightPx, viewportHeightPx);
  const totalHeightPx = itemCount * itemHeightPx;

  const rawStart = Math.floor(safeScrollTop / itemHeightPx);
  const visibleCount = Math.ceil(safeViewport / itemHeightPx);

  const startIndex = Math.max(0, rawStart - overscanCount);
  const endIndex = Math.min(itemCount, rawStart + visibleCount + overscanCount);

  const topSpacerPx = startIndex * itemHeightPx;
  const bottomSpacerPx = Math.max(0, totalHeightPx - endIndex * itemHeightPx);

  return {
    startIndex,
    endIndex,
    topSpacerPx,
    bottomSpacerPx,
    totalHeightPx,
  };
}

interface VirtualListProps<T> {
  items: T[];
  estimateItemHeight: number;
  maxHeightClassName?: string;
  viewportHeightPx?: number;
  overscan?: number;
  virtualizeThreshold?: number;
  itemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
}

/**
 * Lightweight zero-dependency virtualized container.
 * Renders directly when item count is below threshold, and activates
 * viewport-windowed slicing when lists exceed `virtualizeThreshold`.
 */
export function VirtualList<T>({
  items,
  estimateItemHeight,
  maxHeightClassName = 'max-h-[680px]',
  viewportHeightPx = 620,
  overscan = 3,
  virtualizeThreshold = 20,
  itemKey,
  renderItem,
  className = 'space-y-3',
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const shouldVirtualize = items.length > virtualizeThreshold;

  const win = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        startIndex: 0,
        endIndex: items.length,
        topSpacerPx: 0,
        bottomSpacerPx: 0,
        totalHeightPx: items.length * estimateItemHeight,
      };
    }
    return computeVirtualWindow({
      itemCount: items.length,
      itemHeightPx: estimateItemHeight,
      scrollTopPx: scrollTop,
      viewportHeightPx,
      overscanCount: overscan,
    });
  }, [shouldVirtualize, items.length, estimateItemHeight, scrollTop, viewportHeightPx, overscan]);

  if (!shouldVirtualize) {
    return (
      <div className={className}>
        {items.map((item, idx) => (
          <React.Fragment key={itemKey(item, idx)}>{renderItem(item, idx)}</React.Fragment>
        ))}
      </div>
    );
  }

  const visibleSlice = items.slice(win.startIndex, win.endIndex);

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className={`overflow-y-auto custom-scrollbar pr-1 ${maxHeightClassName}`}
    >
      <div className={className}>
        {win.topSpacerPx > 0 && (
          <div style={{ height: `${win.topSpacerPx}px` }} aria-hidden="true" />
        )}
        {visibleSlice.map((item, localIdx) => {
          const absoluteIndex = win.startIndex + localIdx;
          return (
            <React.Fragment key={itemKey(item, absoluteIndex)}>
              {renderItem(item, absoluteIndex)}
            </React.Fragment>
          );
        })}
        {win.bottomSpacerPx > 0 && (
          <div style={{ height: `${win.bottomSpacerPx}px` }} aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
