import React, { useState } from 'react'
import { View, Text, StyleSheet, Image, Pressable, Dimensions, Alert, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol'
import { router } from 'expo-router'
import { Connection, PublicKey } from '@solana/web3.js'
import { getMerchantVaultPda } from '../lib/solana-utils'
import { Buffer } from 'buffer'
import { useWallet } from '../context/WalletContext'

const { height } = Dimensions.get('window')
const RPC_LIST = ['https://devnet.helius-rpc.com/?api-key=7600cbdf-8694-4694-8bf4-869db0600000', 'https://api.devnet.solana.com']

export default function LoginScreen() {
  const { setWallet } = useWallet()
  const [connecting, setConnecting] = useState(false)
  const [status, setStatus] = useState('')

  const checkStatusAndNavigate = async (pubKey: string) => {
    setStatus('Checking merchant profile...')
    try {
      const conn = new Connection(RPC_LIST[0], 'confirmed')
      const [vaultPda] = getMerchantVaultPda(new PublicKey(pubKey))
      const info = await conn.getAccountInfo(vaultPda)

      // VŽDY uložíme peňaženku do kontextu
      await setWallet(pubKey)

      if (info) {
        router.replace('/dashboard')
      } else {
        router.replace('/merchant-setup')
      }
    } catch (e) {
      // Fallback pre sieťové chyby
      await setWallet(pubKey)
      router.replace('/dashboard')
    }
  }

  const handleConnect = async () => {
    if (connecting) return
    setConnecting(true)
    setStatus('Connecting to wallet...')
    try {
      await transact(async (wallet) => {
        const auth = await wallet.authorize({ cluster: 'devnet', identity: { name: 'SubscribeSol', uri: 'https://subscribesol.com' } })
        const pubKey = new PublicKey(Buffer.from(auth.accounts[0].address, 'base64')).toBase58()
        await checkStatusAndNavigate(pubKey)
      })
    } catch (e) {
      setStatus('')
      setConnecting(false)
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#111827', '#030712']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>SubscribeSol</Text>
          <Text style={styles.subtitle}>Merchant Portal</Text>
          <View style={styles.descriptionContainer}>
            <Text style={styles.description}>Connect your wallet to manage your dashboard.</Text>
          </View>
          <Pressable onPress={handleConnect} disabled={connecting} style={styles.buttonContainer}>
            <LinearGradient colors={['#2DD4BF', '#8B5CF6']} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.buttonGradient}>
              {connecting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Connect Wallet</Text>}
            </LinearGradient>
          </Pressable>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  safeArea: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 35 },
  title: { fontSize: 42, fontWeight: '900', color: '#F8FAFC' },
  subtitle: { fontSize: 24, color: '#94A3B8' },
  descriptionContainer: { marginVertical: 40 },
  description: { fontSize: 18, color: '#94A3B8', textAlign: 'center' },
  buttonContainer: { width: '100%', height: 64, borderRadius: 18, overflow: 'hidden' },
  buttonGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  statusText: { color: '#475569', fontSize: 16, marginTop: 20 }
})
