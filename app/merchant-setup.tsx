import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, TextInput, Pressable, Dimensions, Image, Alert, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js'
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol'
import { Buffer } from 'buffer'
import { PROGRAM_ID, slugToHash32, getMerchantVaultPda, getMerchantRegistryPda, disc8 } from '../lib/solana-utils'

const { height } = Dimensions.get('window')

const RPC_LIST = [
  'https://devnet.helius-rpc.com/?api-key=7600cbdf-8694-4694-8bf4-869db0600000',
  'https://api.devnet.solana.com',
  'https://rpc.ankr.com/solana_devnet',
];

export default function MerchantSetupScreen() {
  const { wallet: walletParam } = useLocalSearchParams<{ wallet: string }>()
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [activeConn, setActiveConn] = useState<Connection | null>(null)
  const [status, setStatus] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const getWorkingConnection = async () => {
    for (const url of RPC_LIST) {
      try {
        const conn = new Connection(url, 'confirmed')
        await conn.getLatestBlockhash('processed')
        return conn
      } catch (e) {
        console.log(`Node ${url} busy...`)
      }
    }
    throw new Error('Network busy')
  }

  const scanNodesAndCheckAccount = useCallback(async () => {
    if (scanning) return
    setScanning(true)
    setActiveConn(null)
    setErrorMessage('')
    try {
      const conn = await getWorkingConnection()
      setActiveConn(conn)

      // Ak už máme adresu, skúsime ju znova overiť (fallback pre existujúci profil)
      if (walletParam) {
        const [vaultPda] = getMerchantVaultPda(new PublicKey(walletParam))
        const acc = await conn.getAccountInfo(vaultPda)
        if (acc) {
          router.replace({ pathname: '/dashboard', params: { wallet: walletParam } })
        }
      }
    } catch (e) {
      setErrorMessage('Network busy. Tap to retry.')
    } finally {
      setScanning(false)
    }
  }, [walletParam])

  useEffect(() => {
    scanNodesAndCheckAccount()
  }, [scanNodesAndCheckAccount])

  const handleRegister = async () => {
    if (!activeConn) return
    if (slug.length < 3) {
      Alert.alert('Invalid Slug', 'Slug must be at least 3 characters long.')
      return
    }

    setLoading(true)
    setErrorMessage('')
    setStatus('Preparing...')

    try {
      await transact(async (wallet) => {
        setStatus('Authorizing...')
        const auth = await wallet.authorize({
          cluster: 'devnet',
          identity: { name: 'SubscribeSol', uri: 'https://subscribesol.com', icon: 'favicon.ico' },
        })

        const merchantPk = new PublicKey(Buffer.from(auth.accounts[0].address, 'base64'))
        const slugHash = slugToHash32(slug)
        const [vaultPda] = getMerchantVaultPda(merchantPk)

        setStatus('Building Transaction...')
        const data = Buffer.concat([disc8('register_merchant'), Buffer.from(slugHash)])
        const ix = new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: merchantPk, isSigner: true, isWritable: true },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: getMerchantRegistryPda(slugHash)[0], isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data,
        })

        const { blockhash } = await activeConn.getLatestBlockhash('finalized')
        const tx = new Transaction().add(ix)
        tx.feePayer = merchantPk
        tx.recentBlockhash = blockhash

        setStatus('Waiting for signature...')
        const [signature] = await wallet.signAndSendTransactions({ transactions: [tx] })

        setStatus('Confirming...')
        const checkInterval = setInterval(async () => {
          const acc = await activeConn.getAccountInfo(vaultPda)
          if (acc) {
            clearInterval(checkInterval)
            router.replace({ pathname: '/dashboard', params: { wallet: merchantPk.toBase58() } })
          }
        }, 2000)

        await activeConn.confirmTransaction(signature, 'confirmed')
        clearInterval(checkInterval)
        router.replace({ pathname: '/dashboard', params: { wallet: merchantPk.toBase58() } })
      })
    } catch (error: any) {
      setErrorMessage('Registration failed. Please try again.')
      setStatus('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#111827', '#030712']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={() => router.replace('/')} style={styles.backButton}>
          <Text style={styles.backText}>← Logout</Text>
        </Pressable>

        <View style={styles.content}>
          <Text style={styles.title}>Merchant Setup</Text>

          <View style={styles.walletInfo}>
            <Text style={styles.walletLabel}>Connected Wallet:</Text>
            <Text style={styles.walletValue}>{walletParam ? `${walletParam.slice(0, 8)}...${walletParam.slice(-8)}` : 'Loading...'}</Text>
          </View>

          <View style={styles.scanContainer}>
            {scanning ? (
              <View style={styles.row}>
                <ActivityIndicator size="small" color="#2DD4BF" style={{ marginRight: 10 }} />
                <Text style={styles.scanText}>Checking Solana network...</Text>
              </View>
            ) : activeConn ? (
              <View style={styles.row}>
                <View style={[styles.dot, { backgroundColor: '#2DD4BF' }]} />
                <Text style={[styles.scanText, { color: '#2DD4BF' }]}>Network Ready</Text>
              </View>
            ) : (
              <Pressable onPress={scanNodesAndCheckAccount} style={styles.row}>
                <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
                <Text style={[styles.scanText, { color: '#EF4444', textDecorationLine: 'underline' }]}>Network busy. Tap to retry.</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Merchant Slug</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. bee-in"
              placeholderTextColor="#475569"
              value={slug}
              onChangeText={setSlug}
              autoCapitalize="none"
              editable={!loading}
            />
          </View>

          <Pressable
            onPress={handleRegister}
            disabled={loading || scanning || !activeConn || slug.length < 3}
            style={({ pressed }) => [
              styles.buttonContainer,
              { opacity: (loading || scanning || !activeConn || slug.length < 3) ? 0.4 : pressed ? 0.9 : 1 }
            ]}
          >
            <LinearGradient
              colors={activeConn ? ['#2DD4BF', '#8B5CF6'] : ['#374151', '#374151']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              {loading ? (
                <View style={styles.row}>
                  <ActivityIndicator color="#FFF" style={{ marginRight: 10 }} />
                  <Text style={styles.buttonText}>{status || 'Wait...'}</Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>Register Merchant</Text>
              )}
            </LinearGradient>
          </Pressable>

          {/* FORCE GO TO DASHBOARD BUTTON */}
          <Pressable
            onPress={() => router.replace({ pathname: '/dashboard', params: { wallet: walletParam } })}
            style={{ marginTop: 30, alignItems: 'center' }}
          >
            <Text style={{ color: '#475569', textDecorationLine: 'underline', fontSize: 14 }}>
              DEBUG: Force Dashboard Access
            </Text>
          </Pressable>

          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  safeArea: { flex: 1 },
  backButton: { padding: 20 },
  backText: { color: '#94A3B8', fontSize: 14 },
  content: { flex: 1, paddingHorizontal: 30, paddingTop: 10 },
  title: { fontSize: 32, fontWeight: '900', color: '#F8FAFC', marginBottom: 20 },
  walletInfo: { backgroundColor: 'rgba(255,255,255,0.03)', padding: 15, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  walletLabel: { color: '#94A3B8', fontSize: 12, marginBottom: 4 },
  walletValue: { color: '#F8FAFC', fontSize: 16, fontWeight: '600' },
  scanContainer: { height: 30, marginBottom: 30 },
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  scanText: { fontSize: 14, color: '#94A3B8' },
  inputContainer: { width: '100%', marginBottom: 30 },
  label: { color: '#F8FAFC', fontSize: 14, fontWeight: '600', marginBottom: 10 },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 16, height: 60, paddingHorizontal: 20, color: '#FFF', fontSize: 18 },
  buttonContainer: { width: '100%', height: 60, borderRadius: 16, overflow: 'hidden' },
  buttonGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  errorText: { color: '#EF4444', textAlign: 'center', marginTop: 15, fontSize: 14, fontWeight: '500' },
})
