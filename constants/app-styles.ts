import { StyleSheet } from 'react-native'

/**
 * Global app styles used by existing feature components (Account/Network/etc).
 * We keep the same style keys, but update the look to match the dark + glass
 * “SubscribeSol” design so embedded feature cards don’t look out of place.
 */
export const appStyles = StyleSheet.create({
  // Generic screen wrapper
  screen: {
    flex: 1,
    backgroundColor: '#0B0F1A',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 28,
  },

  // Vertical spacing helper
  stack: {
    gap: 10,
  },

  // Section/title text
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#EAF0FF',
  },

  // “Glass” card used across wallet/network feature UIs
  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  // Optional helper text style (safe to ignore where unused)
  muted: {
    fontSize: 13,
    color: 'rgba(234,240,255,0.62)',
  },
})
