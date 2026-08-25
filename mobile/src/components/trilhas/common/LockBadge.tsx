import React from 'react';
import Svg, { Path } from 'react-native-svg';

export const LockBadge = ({ size = 28, color = '#cfe5d0' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M7 10V7a5 5 0 1 1 10 0v3" stroke={color} strokeWidth={2} strokeLinecap="round"/>
    <Path d="M5 10h14v10H5V10Z" stroke={color} strokeWidth={2} />
    <Path d="M12 14v3" stroke={color} strokeWidth={2} strokeLinecap="round"/>
  </Svg>
)
