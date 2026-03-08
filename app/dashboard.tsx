import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, Pressable, Dimensions, Alert, ActivityIndicator, ScrollView, RefreshControl, TextInput, Switch } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, TransactionInstruction } from '@solana/web3.js'
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol'
import { PROGRAM_ID, USDC_MINT, HAHICO_MINT, getAssociatedTokenAddress, disc8 } from '../lib/solana-utils'
import { Buffer } from 'buffer'
import { useWallet } from '../context/WalletContext'

const { width } = Dimensions.get('window')
const RPC_LIST = ['https://devnet.helius-rpc.com/?api-key=7600cbdf-8694-4694-8bf4-869db0600000', 'https://api.devnet.solana.com']

export default function DashboardScreen() {
  const { wallet, setWallet, isLoading: isWalletLoading } = useWallet()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const [balances, setBalances] = useState({ sol: 0, usdc: 0, hahico: 0 })
  const [merchantSlug, setMerchantSlug] = useState('bee-in')
  const [settings, setSettings] = useState({
    subEnabled: true, hahicoEnabled: true, plansMask: 4, defaultPlan: 4,
    priceDay: '0', priceWeek: '0', priceMonth: '0', priceYear: '0',
    registryPda: null as string | null,
  })

  const fetchData = useCallback(async (targetWallet: string) => {
    setLoading(true);
    try {
      const conn = new Connection(RPC_LIST[0], 'confirmed');
      const pubKey = new PublicKey(targetWallet);

      const sol = await conn.getBalance(pubKey);
      const usdcAta = getAssociatedTokenAddress(USDC_MINT, pubKey);
      const hahicoAta = getAssociatedTokenAddress(HAHICO_MINT, pubKey);

      let uVal = 0, hVal = 0;
      try { uVal = (await conn.getTokenAccountBalance(usdcAta)).value.uiAmount || 0; } catch(e) {}
      try { hVal = (await conn.getTokenAccountBalance(hahicoAta)).value.uiAmount || 0; } catch(e) {}
      setBalances({ sol: sol/LAMPORTS_PER_SOL, usdc: uVal, hahico: hVal });

      const accounts = await conn.getProgramAccounts(PROGRAM_ID, { filters: [{ memcmp: { offset: 8, bytes: targetWallet } }] });
      if (accounts.length > 0) {
        const data = accounts[0].account.data;
        setSettings({
          registryPda: accounts[0].pubkey.toBase58(),
          subEnabled: data[73] === 1, hahicoEnabled: data[72] === 1,
          plansMask: data[74], defaultPlan: data[75],
          priceDay: (Number(data.readBigUInt64LE(76)) / 1_000_000).toString(),
          priceWeek: (Number(data.readBigUInt64LE(84)) / 1_000_000).toString(),
          priceMonth: (Number(data.readBigUInt64LE(92)) / 1_000_000).toString(),
          priceYear: (Number(data.readBigUInt64LE(100)) / 1_000_000).toString(),
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isWalletLoading) return;
    if (!wallet) {
      setLoading(false);
      return;
    }
    fetchData(wallet);
  }, [wallet, isWalletLoading, fetchData]);

  const handleLogout = () => {
    setWallet(null);
    router.replace('/');
  };

  if (!wallet && !loading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#0F111A', '#08090F']} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={{flex:1, justifyContent:'center', alignItems:'center'}}>
          <Text style={{color:'white', marginBottom: 20}}>Please connect your wallet first.</Text>
          <Pressable onPress={() => router.replace('/')} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>Back to Login</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0F111A', '#08090F']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View><Text style={styles.headerTitle}>Merchant Dashboard</Text><Text style={styles.slugText}>@{merchantSlug}</Text></View>
          <Pressable onPress={handleLogout}><Text style={styles.logoutTxt}>Logout</Text></Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {if(wallet) fetchData(wallet);}} tintColor="#2DD4BF" />}>
          <View style={styles.walletCard}>
            <Text style={styles.cardSmallLabel}>WALLET: {wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-6)}` : '---'}</Text>
            <View style={styles.balancesRow}>
              {loading && !refreshing ? (
                <ActivityIndicator color="#2DD4BF" style={{flex:1}} />
              ) : (
                <>
                  <View style={styles.balBox}><Text style={styles.balVal}>{balances.sol.toFixed(2)}</Text><Text style={styles.balUnit}>SOL</Text></View>
                  <View style={styles.balBox}><Text style={styles.balVal}>{balances.usdc.toFixed(2)}</Text><Text style={styles.balUnit}>USDC</Text></View>
                  <View style={styles.balBox}><Text style={styles.balVal}>{balances.hahico.toLocaleString()}</Text><Text style={styles.balUnit}>HAHICO</Text></View>
                </>
              )}
            </View>
          </View>

          {!isEditing ? (
            <View style={styles.planSummaryCard}>
              <Text style={styles.sectionTitle}>Plan Summary</Text>
              <Text style={styles.sumText}>Default Interval: {settings.defaultPlan === 4 ? 'Monthly' : 'Yearly'}</Text>
              <Pressable style={styles.mainActionBtn} onPress={() => setIsEditing(true)}>
                <LinearGradient colors={['#2DD4BF', '#8B5CF6']} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.btnGradient}><Text style={styles.btnText}>Edit Subscription Plan</Text></LinearGradient>
              </Pressable>
            </View>
          ) : (
            <View style={styles.editSection}>
              <Text style={styles.sectionTitle}>Prices (USDC)</Text>
              {[
                { label: 'Monthly', mask: 4, key: 'priceMonth' as const },
                { label: 'Yearly', mask: 8, key: 'priceYear' as const },
              ].map(p => (
                <View key={p.label} style={styles.priceRow}>
                  <Switch value={(settings.plansMask & p.mask) !== 0} onValueChange={v => setSettings(s => ({...s, plansMask: v ? s.plansMask | p.mask : s.plansMask & ~p.mask}))} />
                  <Text style={styles.pLabel}>{p.label}</Text>
                  <TextInput style={styles.input} value={settings[p.key]} keyboardType="numeric" onChangeText={v => setSettings(s => ({...s, [p.key]: v}))} />
                  <Pressable disabled={(settings.plansMask & p.mask) === 0} onPress={() => setSettings(s => ({...s, defaultPlan: p.mask}))} style={[styles.defBtn, settings.defaultPlan === p.mask && styles.defBtnAct, (settings.plansMask & p.mask) === 0 && { opacity: 0.2 }]}><Text style={styles.defText}>Default</Text></Pressable>
                </View>
              ))}
              <Pressable style={styles.saveBtn} onPress={() => Alert.alert('Notice', 'On-chain save ready.')}><Text style={styles.saveBtnText}>Save Settings</Text></Pressable>
              <Pressable onPress={() => setIsEditing(false)} style={{marginTop:15, alignItems:'center'}}><Text style={{color:'#475569'}}>Cancel</Text></Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#08090F' }, safeArea: { flex: 1 }, header: { flexDirection: 'row', justifyContent: 'space-between', padding: 24, alignItems: 'center' },
  headerTitle: { color: '#94A3B8', fontSize: 12, fontWeight: '700' }, slugText: { color: '#2DD4BF', fontSize: 18, fontWeight: '800' }, logoutTxt: { color: '#EF4444', fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingBottom: 40 }, walletCard: { backgroundColor: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 24, marginBottom: 25, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  cardSmallLabel: { color: '#475569', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }, balancesRow: { flexDirection: 'row', justifyContent: 'space-between' },
  balBox: { alignItems: 'center' }, balVal: { color: '#F8FAFC', fontSize: 22, fontWeight: '900' }, balUnit: { color: '#94A3B8', fontSize: 10, fontWeight: '700' },
  sectionTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '700', marginBottom: 15 }, planSummaryCard: { backgroundColor: 'rgba(255,255,255,0.02)', padding: 24, borderRadius: 24, marginBottom: 25 },
  sumText: { color: '#94A3B8', fontSize: 14, marginBottom: 8 }, mainActionBtn: { height: 56, borderRadius: 16, overflow: 'hidden', marginTop: 15 },
  btnGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' }, btnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  editSection: { paddingBottom: 20 }, priceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  pLabel: { color: '#94A3B8', width: 55, fontSize: 13 }, input: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', height: 44, borderRadius: 12, color: '#FFF', textAlign: 'center', fontWeight: '700' },
  defBtn: { paddingHorizontal: 10, height: 44, justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' }, defBtnAct: { backgroundColor: '#2DD4BF' }, defText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  saveBtn: { backgroundColor: '#2DD4BF', height: 58, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginTop: 25 }, saveBtnText: { color: '#08090F', fontWeight: '900', fontSize: 16 }
})
