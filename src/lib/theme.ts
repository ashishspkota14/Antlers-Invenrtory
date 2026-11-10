import { useColorScheme } from 'react-native';

const light = {
  bg: '#F6F2EC',
  card: '#FFFFFF',
  text: '#1C1714',
  muted: '#6E655D',
  border: '#E2D9CE',
  accent: '#C8551B', // Antlers orange
  accentSoft: '#F6E3D6',
  good: '#2E7D4F',
  danger: '#B3261E',
  boxBg: '#FBF8F4',
};

const dark: typeof light = {
  bg: '#14110F',
  card: '#1F1A17',
  text: '#F3EDE6',
  muted: '#A2978C',
  border: '#352D28',
  accent: '#E8743A',
  accentSoft: '#3A2418',
  good: '#5CBF85',
  danger: '#F2726B',
  boxBg: '#2A231F',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
