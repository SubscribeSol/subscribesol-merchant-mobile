import { Button } from 'react-native'
import React from 'react'
import { useMobileWallet } from '@wallet-ui/react-native-kit'

export function AccountFeatureConnect() {
  const { accounts, connect } = useMobileWallet()
  const connected = Array.isArray(accounts) && accounts.length > 0

  return (
    <Button
      disabled={connected}
      title={connected ? 'Connected' : 'Connect Wallet'}
      onPress={connect}
    />
  )
}