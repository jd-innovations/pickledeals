import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Platform } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Semantic icon set. iOS renders SF Symbols (native weight, Dynamic Type friendly);
 * other platforms fall back to the stroke icons drawn for the approved design.
 */
const ICONS = {
  star: { sf: 'star', sfFilled: 'star.fill', d: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z' },
  heart: { sf: 'heart', sfFilled: 'heart.fill', d: 'M12 20.5s-7.5-4.4-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.8-7.5 10.2-7.5 10.2z' },
  bell: { sf: 'bell', sfFilled: 'bell.fill', d: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z M10 20a2 2 0 0 0 4 0' },
  search: { sf: 'magnifyingglass', d: 'M20 20l-3.5-3.5 M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z' },
  chevronLeft: { sf: 'chevron.left', d: 'M15 18l-6-6 6-6' },
  chevronRight: { sf: 'chevron.right', d: 'M9 6l6 6-6 6' },
  chevronDown: { sf: 'chevron.down', d: 'M6 9l6 6 6-6' },
  share: { sf: 'square.and.arrow.up', d: 'M12 3v12 M8 7l4-4 4 4 M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7' },
  filter: { sf: 'line.3.horizontal.decrease', d: 'M4 7h16 M7 12h10 M10 17h4' },
  pin: { sf: 'mappin.and.ellipse', d: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z' },
  map: { sf: 'map', d: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z M9 4v14 M15 6v14' },
  grid: { sf: 'square.grid.2x2', d: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z' },
  external: { sf: 'arrow.up.right', d: 'M7 17L17 7 M9 7h8v8' },
  arrowDown: { sf: 'arrow.down', d: 'M12 5v14 M6 13l6 6 6-6' },
  copy: { sf: 'doc.on.doc', d: 'M8 8h12v12H8z M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2' },
  check: { sf: 'checkmark', d: 'M5 12.5l4.5 4.5L19 7.5' },
  checkCircle: { sf: 'checkmark.circle', d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M8 12.3l2.8 2.8L16.2 9.6' },
  close: { sf: 'xmark', d: 'M6 6l12 12 M18 6L6 18' },
  plus: { sf: 'plus', d: 'M12 5v14 M5 12h14' },
  minus: { sf: 'minus', d: 'M5 12h14' },
  bellSlash: { sf: 'bell.slash', d: 'M6 16V11a6 6 0 0 1 9.5-4.9 M18 11v5l1.5 2h-15 M10 20a2 2 0 0 0 4 0 M4 4l16 16' },
  flag: { sf: 'flag', d: 'M5 21V4 M5 4h11l-2 4 2 4H5' },
  hand: { sf: 'hand.raised', d: 'M8 13V5a1.5 1.5 0 0 1 3 0v6 M11 11V4a1.5 1.5 0 0 1 3 0v7 M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-12 0v-3a1.5 1.5 0 0 1 3 0' },
  photo: { sf: 'photo', d: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4' },
  archive: { sf: 'archivebox', d: 'M3 5h18v4H3z M5 9v10h14V9 M10 13h4' },
  locate: { sf: 'location', d: 'M20 4L4 11l7 2 2 7z' },
  refresh: { sf: 'arrow.triangle.2.circlepath', d: 'M4 12a8 8 0 0 1 14-5.3 M20 12a8 8 0 0 1-14 5.3 M18 3v4h-4 M6 21v-4h4' },
  camera: { sf: 'camera', d: 'M4 8h3l2-3h6l2 3h3v11H4z' },
  clock: { sf: 'clock', d: 'M12 7.5V12l3 2' },
  more: { sf: 'ellipsis', d: 'M3.6 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0 M10.6 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0 M17.6 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0' },
  shield: { sf: 'checkmark.shield', d: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z' },
  send: { sf: 'arrow.up', d: 'M12 19V5 M6 11l6-6 6 6' },
  tag: { sf: 'tag', d: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z' },
  ship: { sf: 'shippingbox', d: 'M3 7h11v9H3z M14 10h4l3 3v3h-7' },
  message: { sf: 'bubble.left', d: 'M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 20.5l1-4.4A8.5 8.5 0 1 1 20.5 12z' },
  sliders: { sf: 'slider.horizontal.3', d: 'M4 7h10 M18 7h2 M4 17h4 M12 17h8' },
  // Profile rows (approved Oct 14: icons on every row).
  priceAlert: { sf: 'chart.line.downtrend.xyaxis', d: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z M8 7.5h.01 M12 10v6 M9.5 13.5L12 16l2.5-2.5' },
  person: { sf: 'person', d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20.5a7.5 7.5 0 0 1 15 0' },
  help: { sf: 'questionmark.circle', d: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.4v.6 M12 16.8h.01' },
  doc: { sf: 'doc.text', d: 'M7 3h7l4 4v14H7z M14 3v4h4 M9.5 12h5 M9.5 16h5' },
  lock: { sf: 'lock', d: 'M6 11h12v9.5H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3' },
  info: { sf: 'info.circle', d: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z M12 11v5.5 M12 7.8h.01' },
  appearance: { sf: 'circle.lefthalf.filled', d: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z M12 3.5v17' },
} as const;

export type IconName = keyof typeof ICONS;

type Props = {
  name: IconName;
  size?: number;
  color: string;
  filled?: boolean;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
};

export function Icon({ name, size = 20, color, filled, weight = 'medium' }: Props) {
  const icon = ICONS[name];
  if (Platform.OS === 'ios') {
    const sf = (filled && 'sfFilled' in icon ? icon.sfFilled : icon.sf) as SFSymbol;
    return <SymbolView name={sf} size={size} tintColor={color} weight={weight} />;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d={icon.d} />
      {name === 'clock' && <Circle cx={12} cy={12} r={8.5} />}
      {name === 'pin' && <Circle cx={12} cy={9.5} r={2.5} />}
      {name === 'camera' && <Circle cx={12} cy={13} r={3.5} />}
    </Svg>
  );
}
