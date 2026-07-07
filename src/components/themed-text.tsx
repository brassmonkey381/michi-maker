import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, FontSize, Palette, ThemeColor, Weight } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: FontSize.body,
    lineHeight: 20,
    fontWeight: Weight.medium,
  },
  smallBold: {
    fontSize: FontSize.body,
    lineHeight: 20,
    fontWeight: Weight.bold,
  },
  default: {
    fontSize: FontSize.md,
    lineHeight: 24,
    fontWeight: Weight.medium,
  },
  title: {
    fontSize: FontSize.hero,
    fontWeight: Weight.semibold,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: Weight.semibold,
  },
  link: {
    lineHeight: 30,
    fontSize: FontSize.body,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: FontSize.body,
    color: Palette.link,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: FontSize.base,
  },
});
