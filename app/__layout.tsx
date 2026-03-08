import { Stack } from 'expo-router'
import { View } from 'react-native'
import { WalletProvider } from '../context/WalletContext'

export default function RootLayout() {
  return (
    <WalletProvider>
      <View style={{ flex: 1, backgroundColor: '#030712' }}>
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="dashboard" />
          <Stack.Screen name="merchant-setup" />
        </Stack>
      </View>
    </WalletProvider>
  )
}
