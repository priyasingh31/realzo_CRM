import { useWindowDimensions, Platform } from 'react-native';

export const isWeb = Platform.OS === 'web';
export const WEB_MAX_WIDTH = 1280;

export function useResponsive() {
  const { width } = useWindowDimensions();
  const isMobile  = width < 768;
  const isTablet  = width >= 768 && width < 1024;
  const isDesktop = width >= 1024;

  // Metric card grid: 4 cols on tablet+, 2 on mobile (avoids orphan on 3-col)
  const metricColWidth: string =
    isDesktop || isTablet ? '25%' : '50%';

  // Source card flex basis: more cols on wider screens
  const sourceColBasis: string =
    isDesktop ? '14%' : isTablet ? '28%' : '30%';

  return { width, isMobile, isTablet, isDesktop, metricColWidth, sourceColBasis };
}

// Use as style on a wrapper View inside any ScrollView to centre content on web
export const webContainer = isWeb
  ? ({ maxWidth: WEB_MAX_WIDTH, width: '100%' as const, alignSelf: 'center' as const })
  : undefined;
