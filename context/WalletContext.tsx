import React, { createContext, useContext, useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

type WalletContextType = {
  wallet: string | null
  setWallet: (addr: string | null) => void
  isLoading: boolean
}

const WalletContext = createContext<WalletContextType>({
  wallet: null,
  setWallet: () => {},
  isLoading: true
})

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWalletState] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Načítanie peňaženky pri štarte aplikácie
  useEffect(() => {
    const loadWallet = async () => {
      try {
        const saved = await AsyncStorage.getItem('wallet_addr')
        if (saved) setWalletState(saved)
      } catch (e) {
        console.error('Failed to load wallet from storage', e)
      } finally {
        setIsLoading(false)
      }
    }
    loadWallet()
  }, [])

  const setWallet = async (addr: string | null) => {
    setWalletState(addr)
    if (addr) {
      await AsyncStorage.setItem('wallet_addr', addr)
    } else {
      await AsyncStorage.removeItem('wallet_addr')
    }
  }

  return (
    <WalletContext.Provider value={{ wallet, setWallet, isLoading }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  return useContext(WalletContext)
}
