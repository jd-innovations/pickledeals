import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

/**
 * Dev-only stand-in for catalog photography (same drawings as the approved design).
 * Real screens render ProductImage with catalog/listing image URLs.
 */
export type PlaceholderKind = 'paddle' | 'shoe' | 'ball' | 'bag' | 'grip' | 'eyewear' | 'apparel' | 'machine' | 'net';

export function PlaceholderArt({ kind, c1, c2 }: { kind: PlaceholderKind; c1: string; c2: string }) {
  return (
    <Svg viewBox="0 0 200 200" width="100%" height="100%">
      {kind === 'paddle' && (
        <>
          <Ellipse cx={100} cy={186} rx={44} ry={5} fill="#000" opacity={0.08} />
          <G transform="rotate(-18 100 100)">
            <Rect x={88} y={132} width={24} height={56} rx={8} fill="#1c1c1c" />
            <Rect x={88} y={132} width={24} height={7} fill={c2} />
            <Rect x={58} y={16} width={84} height={120} rx={40} fill={c1} />
            <Path d="M62 92 L138 50 L138 68 L62 110 Z" fill={c2} />
            <Rect x={58} y={16} width={84} height={120} rx={40} fill="none" stroke="#141414" strokeWidth={4} />
          </G>
        </>
      )}
      {kind === 'shoe' && (
        <>
          <Ellipse cx={104} cy={158} rx={80} ry={6} fill="#000" opacity={0.08} />
          <Path d="M24 128 C22 146 30 152 44 152 L170 152 C184 152 188 144 184 132 Z" fill="#f7f7f5" stroke="#cfcfcb" strokeWidth={2} />
          <Path d="M26 130 L32 92 C34 80 44 76 56 79 L76 84 C88 70 104 70 112 78 L124 98 C146 104 166 110 178 116 C188 121 188 128 184 132 Z" fill={c1} />
          <Path d="M56 122 C96 108 136 110 172 120 L170 127 C136 118 98 118 58 130 Z" fill={c2} />
          <Path d="M80 88 L112 81 M84 96 L117 89 M88 104 L121 97" stroke="#fff" strokeWidth={4} strokeLinecap="round" />
        </>
      )}
      {kind === 'ball' && (
        <>
          <Ellipse cx={100} cy={170} rx={48} ry={6} fill="#000" opacity={0.08} />
          <Circle cx={100} cy={96} r={62} fill={c1} />
          <G fill="#000" opacity={0.16}>
            {[[100, 58], [68, 82], [132, 82], [100, 96], [82, 118], [118, 118], [100, 142]].map(([x, y]) => (
              <Circle key={`${x}-${y}`} cx={x} cy={y} r={6} />
            ))}
          </G>
        </>
      )}
      {kind === 'bag' && (
        <>
          <Rect x={112} y={8} width={14} height={40} rx={5} fill="#1c1c1c" />
          <Rect x={52} y={38} width={96} height={134} rx={30} fill={c1} />
          <Rect x={64} y={104} width={72} height={56} rx={16} fill={c2} />
        </>
      )}
      {kind === 'grip' && (
        <G transform="rotate(-24 100 100)">
          <Rect x={34} y={62} width={132} height={36} rx={18} fill={c1} />
          <Rect x={34} y={108} width={132} height={36} rx={18} fill={c2} />
        </G>
      )}
      {kind === 'eyewear' && (
        <>
          <Rect x={28} y={84} width={64} height={46} rx={20} fill={c2} stroke={c1} strokeWidth={7} />
          <Rect x={108} y={84} width={64} height={46} rx={20} fill={c2} stroke={c1} strokeWidth={7} />
          <Path d="M92 98 Q100 90 108 98" stroke={c1} strokeWidth={6} fill="none" />
        </>
      )}
      {kind === 'apparel' && (
        <Path d="M70 30 L48 40 L20 72 L44 96 L58 84 L58 170 L142 170 L142 84 L156 96 L180 72 L152 40 L130 30 C124 46 76 46 70 30 Z" fill={c1} />
      )}
      {kind === 'machine' && (
        <>
          <Rect x={48} y={78} width={104} height={84} rx={14} fill={c1} />
          <Circle cx={100} cy={116} r={16} fill="#1c1c1c" />
          <Circle cx={66} cy={168} r={10} fill="#1c1c1c" />
          <Circle cx={134} cy={168} r={10} fill="#1c1c1c" />
        </>
      )}
      {kind === 'net' && (
        <>
          <Rect x={20} y={64} width={8} height={104} fill="#1c1c1c" />
          <Rect x={172} y={64} width={8} height={104} fill="#1c1c1c" />
          <Rect x={28} y={70} width={144} height={10} fill={c1} />
          <Path d="M28 92 H172 M28 104 H172 M28 116 H172 M28 128 H172" stroke="#1c1c1c" strokeOpacity={0.35} />
        </>
      )}
    </Svg>
  );
}
