import type { LatLng, MapRegion } from '@pickledeals/shared';
import type { Ref } from 'react';

import type { ImageSource } from '@/commerce';

import type { MapPin } from './cluster';

export type ListingMapHandle = { animateTo: (r: MapRegion) => void };

/** Provider-neutral map contract (D4). Points are public cell centres only (D2). */
export type ListingMapProps = {
  ref?: Ref<ListingMapHandle>;
  initialRegion: MapRegion;
  pins: MapPin[];
  selectedId: string | null;
  selectedImage?: ImageSource;
  /** Show the platform's own user-location dot (stays on device). */
  showsUser?: boolean;
  /** Called when the viewport settles after a pan or zoom. */
  onRegionChange: (r: MapRegion) => void;
  onSelectPin: (id: string) => void;
  /** A cluster whose listings all share one ~1 km cell (can't be split by zooming). */
  onSelectCell: (ids: string[]) => void;
  onPressMap: () => void;
  topInset?: number;
  bottomInset?: number;
};

export type AreaMapProps = {
  center: LatLng;
  height: number;
  /** Caption drawn on the map. */
  label?: string;
  labelStyle?: 'badge' | 'title';
  /** Place name for screen readers ("Lakewood Ranch, FL"). */
  areaName?: string | null;
};
