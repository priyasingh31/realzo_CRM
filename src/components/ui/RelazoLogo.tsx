import React from 'react';
import Svg, { Text, Rect } from 'react-native-svg';

interface Props {
  width?: number;
  height?: number;
  /** 'dark' = indigo text on white bg (sidebar). 'light' = white text on dark bg (login). */
  variant?: 'dark' | 'light';
}

export function RelazoLogo({ width = 120, height = 40, variant = 'dark' }: Props) {
  const textColor = variant === 'light' ? '#FFFFFF' : '#2B2D8E';

  return (
    <Svg width={width} height={height} viewBox="0 0 120 40">
      {/* "relazo" wordmark */}
      <Text
        x="4"
        y="30"
        fontSize="28"
        fontWeight="700"
        fill={textColor}
        letterSpacing="-0.5"
      >
        relazo
      </Text>
      {/* Red partial bracket — top, right, bottom */}
      <Rect x="90" y="6"    width="26"  height="2.5" fill="#FF2D2D" rx="1" />
      <Rect x="113.5" y="6" width="2.5" height="29"  fill="#FF2D2D" rx="1" />
      <Rect x="90" y="32.5" width="26"  height="2.5" fill="#FF2D2D" rx="1" />
    </Svg>
  );
}
