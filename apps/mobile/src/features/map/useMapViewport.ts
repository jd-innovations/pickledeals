import { regionBounds, viewportMoved, type MapRegion } from '@pickledeals/shared';
import { useState } from 'react';

/**
 * Tracks the live viewport and the area last searched. `bounds` only changes when the user asks
 * ("Search this area") or the map is re-centred, so panning never refetches on its own.
 */
export function useMapViewport() {
  const [current, setCurrent] = useState<MapRegion | null>(null);
  const [searched, setSearched] = useState<MapRegion | null>(null);
  return {
    current,
    bounds: searched ? regionBounds(searched) : null,
    moved: !!current && !!searched && viewportMoved(searched, current),
    onRegionChange: setCurrent,
    searchHere: () => setSearched(current),
    /** Jump the search (and viewport) to a region — first load and "recentre". */
    reset: (r: MapRegion) => {
      setCurrent(r);
      setSearched(r);
    },
  };
}
