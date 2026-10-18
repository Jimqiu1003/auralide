import type { JSX } from 'react';

const paths = {
  slide: 'M3 5h18v13H3zM8 21h8M12 18v3',
  text: 'M4 5h16M12 5v15M8 20h8',
  shape: 'M5 4h14v15H5z',
  folder: 'M3 7V5h6l2 2h10v12H3z',
  save: 'M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-8h8v8',
  undo: 'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12',
  redo: 'm15 5 5 5-5 5M20 10H10a6 6 0 0 0 0 12',
  trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
  compass: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-6-3-2 5-4 1 2-5z',
  shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6zM8 12l3 3 5-6',
  fit: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M7 7h10v10H7z',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  sliders: 'M5 3v5M5 12v9M12 3v10M12 17v4M19 3v3M19 10v11M2 8h6M9 13h6M16 6h6',
} as const;

export function Icon({ name }: { name: keyof typeof paths }): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
