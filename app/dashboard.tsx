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
import AsyncStorage from '@react-native-async-storage/async-storage'

const { width } = Dimensions.get('window')
const RPC_LIST = [
  'https://devnet.helius-rpc.com/?api-key=7600cbdf-8694-4694-8bf4-869db0600000',
  'https://api.devnet.solana.com',
]

const PLAN_DAILY = 1; const PLAN_WEEKLY = 2; const PLAN_MONTHLY = 4; const PLAN_YEARLY = 8;

export default function DashboardScreen() {
  const { wallet, setWallet, isLoading: isWalletLoading } = useWallet()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const [balances, setBalances] = useState({ sol: 0, usdc: 0, hahico: 0 })
  const [merchantSlug, setMerchantSlug] = useState<string | null>(null)
  const [settings, setSettings] = useState({
    subEnabled: true, hahicoEnabled: true, plansMask: 4, defaultPlan: 4,
    priceDay: '0', priceWeek: '0', priceMonth: '0', priceYear: '0',
    registryPda: null as string | null,
  })

  const fetchData = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      // Find working connection
      let conn;
      for (const url of RPC_LIST) {
        try {
          const c = new Connection(url, 'confirmed');
          await c.getLatestBlockhash('processed');
          conn = c; break;
        } catch (e) {}
      }
      if (!conn) throw new Error('Nodes busy');

      const pubKey = new PublicKey(wallet);

      // 1. SOL Balance
      const sol = await conn.getBalance(pubKey);

      // 2. Token Balances (USDC & HAHICO)
      const usdcAta = getAssociatedTokenAddress(USDC_MINT, pubKey);
      const hahicoAta = getAssociatedTokenAddress(HAHICO_MINT, pubKey);
      let uVal = 0, hVal = 0;
      try { uVal = (await conn.getTokenAccountBalance(usdcAta)).value.uiAmount || 0; } catch(e) {}
      try { hVal = (await conn.getTokenAccountBalance(hahicoAta)).value.uiAmount || 0; } catch(e) {}
      setBalances({ sol: sol/LAMPORTS_PER_SOL, usdc: uVal, hahico: hVal });

      // 3. Merchant Registry & Settings
      const accounts = await conn.getProgramAccounts(PROGRAM_ID, {
        filters: [{ memcmp: { offset: 8, bytes: wallet } }]
      });

      if (accounts.length > 0) {
        const data = accounts[0].account.data;
        setSettings({
          registryPda: accounts[0].pubkey.toBase58(),
          subEnabled: data[73] === 1,
          hahicoEnabled: data[72] === 1,
          plansMask: data[74],
          defaultPlan: data[75],
          priceDay: (Number(data.readBigUInt64LE(76)) / 1_000_000).toString(),
          priceWeek: (Number(data.readBigUInt64LE(84)) / 1_000_000).toString(),
          priceMonth: (Number(data.readBigUInt64LE(92)) / 1_000_000).toString(),
          priceYear: (Number(data.readBigUInt64LE(100)) / 1_000_000).toString(),
        });

        // Try to get slug from storage if it was saved during registration on mobile
        const savedSlug = await AsyncStorage.getItem('merchant_slug_' + wallet);
        if (savedSlug) setMerchantSlug(savedSlug);
      }
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [wallet]);

  useEffect(() => {
    if (wallet && !isWalletLoading) fetchData();
  }, [wallet, isWalletLoading, fetchData]);

  const saveOnChain = async () => {
    if (!settings.registryPda || saving) return;
    setSaving(true);
    try {
      await transact(async (walletAdapter) => {
        const auth = await walletAdapter.authorize({
          cluster: 'devnet',
          identity: { name: 'SubscribeSol', uri: 'https://subscribesol.com' }
        });
        const merchantPk = new PublicKey(Buffer.from(auth.accounts[0].address, 'base64'));

        const data = Buffer.alloc(44);
        disc8('update_merchant_settings_v2').copy(data);
        data.writeUInt8(settings.subEnabled ? 1 : 0, 8);
        data.writeUInt8(settings.hahicoEnabled ? 1 : 0, 9);
        data.writeUInt8(settings.plansMask, 10);
        data.writeUInt8(settings.defaultPlan, 11);
        data.writeBigUInt64LE(BigInt(Math.floor(Number(settings.priceDay) * 1_000_000)), 12);
        data.writeBigUInt64LE(BigInt(Math.floor(Number(settings.priceWeek) * 1_000_000)), 20);
        data.writeBigUInt64LE(BigInt(Math.floor(Number(settings.priceMonth) * 1_000_000)), 28);
        data.writeBigUInt64LE(BigInt(Math.floor(Number(settings.priceYear) * 1_000_000)), 36);

        const ix = new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: merchantPk, isSigner: true, isWritable: true },
            { pubkey: new PublicKey(settings.registryPda!), isSigner: false, isWritable: true }
          ],
          data,
        });

        const conn = new Connection(RPC_LIST[0], 'confirmed');
        const { blockhash } = await conn.getLatestBlockhash();
        const tx = new Transaction().add(ix);
        tx.feePayer = merchantPk; tx.recentBlockhash = blockhash;

        await walletAdapter.signAndSendTransactions({ transactions: [tx] });
        Alert.alert('Success', 'On-chain settings updated!');
        setIsEditing(false);
        fetchData();
      });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const getPlanLabel = (mask: number) => {
    if (mask === 1) return 'Daily';
    if (mask === 2) return 'Weekly';
    if (mask === 4) return 'Monthly';
    if (mask === 8) return 'Yearly';
    return 'None';
  };

  if (!wallet && !isWalletLoading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#0F111A', '#08090F']} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={styles.centerContent}>
          <Text style={{ color: '#FFF', marginBottom: 20 }}>Session expired. Please log in again.</Text>
          <Pressable onPress={() => router.replace('/')} style={styles.saveBtn}><Text style={styles.saveBtnText}>Go to Login</Text></Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0F111A', '#08090F']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Merchant Dashboard</Text>
            <Text style={styles.slugText}>{merchantSlug ? `@${merchantSlug}` : 'Loading profile...'}</Text>
          </View>
          <Pressable onPress={() => { setWallet(null); router.replace('/'); }}><Text style={styles.logoutTxt}>Logout</Text></Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchData();}} tintColor="#2DD4BF" />}>

          {/* Main Wallet Card */}
          <View style={styles.walletCard}>
            <View style={styles.walletHeader}>
              <Text style={styles.walletLabel}>WALLET: {wallet?.slice(0, 4)}...{wallet?.slice(-4)}</Text>
              <Text style={styles.networkTag}>Devnet</Text>
            </View>
            <View style={styles.balancesRow}>
              <View style={styles.balItem}><Text style={styles.balVal}>{balances.sol.toFixed(2)}</Text><Text style={styles.balUnit}>SOL</Text></View>
              <View style={styles.balItem}><Text style={styles.balVal}>{balances.usdc.toFixed(2)}</Text><Text style={styles.balUnit}>USDC</Text></View>
              <View style={styles.balItem}><Text style={styles.balVal}>{balances.hahico.toFixed(0)}</Text><Text style={styles.balUnit}>HAHICO</Text></View>
            </View>
          </View>

          {!isEditing ? (
            <>
              {/* Plan Summary */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Plan Summary</Text>
                <Text style={styles.sumText}>Default Interval: <Text style={{color: '#FFF', fontWeight: 'bold'}}>{getPlanLabel(settings.defaultPlan)}</Text></Text>
                <Text style={styles.sumText}>Current Price: <Text style={{color: '#2DD4BF', fontWeight: 'bold'}}>{settings.defaultPlan === 4 ? settings.priceMonth : settings.priceYear} USDC</Text></Text>

                <Pressable style={styles.editMainBtn} onPress={() => setIsEditing(true)}>
                  <LinearGradient colors={['#2DD4BF', '#8B5CF6']} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.btnGrad}><Text style={styles.btnText}>Edit Subscription Plan</Text></LinearGradient>
                </Pressable>
              </View>

              {/* Withdraw Section */}
              <View style={styles.withdrawCard}>
                <View>
                  <Text style={styles.cardSmallLabel}>TREASURY BALANCE</Text>
                  <Text style={styles.treasuryVal}>0.00 USDC</Text>
                </View>
                <Pressable style={styles.withdrawBtn} onPress={() => Alert.alert('Notice', 'Feature coming soon.')}>
                  <Text style={styles.withdrawBtnText}>Withdraw</Text>
                </Pressable>
              </View>
            </>
          ) : (
            /* EDIT MODE */
            <View style={styles.editSection}>
              <Text style={styles.sectionTitle}>Program Settings</Text>
              <View style={styles.toggleRow}><Text style={styles.label}>Subscriptions ON/OFF</Text><Switch value={settings.subEnabled} onValueChange={v => setSettings({...settings, subEnabled: v})} /></View>
              <View style={styles.toggleRow}><Text style={styles.label}>Accept HAHICO discounts</Text><Switch value={settings.hahicoEnabled} onValueChange={v => setSettings({...settings, hahicoEnabled: v})} /></View>

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Plans & Prices (USDC)</Text>

              {[
                { label: 'Daily', mask: PLAN_DAILY, key: 'priceDay' as const },
                { label: 'Weekly', mask: PLAN_WEEKLY, key: 'priceWeek' as const },
                { label: 'Monthly', mask: PLAN_MONTHLY, key: 'priceMonth' as const },
                { label: 'Yearly', mask: PLAN_YEARLY, key: 'priceYear' as const },
              ].map(p => {
                const isEnabled = (settings.plansMask & p.mask) !== 0;
                const isDefault = settings.defaultPlan === p.mask;
                return (
                  <View key={p.label} style={styles.priceRow}>
                    <Switch value={isEnabled} onValueChange={v => setSettings(s => ({...s, plansMask: v ? s.plansMask | p.mask : s.plansMask & ~p.mask}))} />
                    <Text style={styles.pLabel}>{p.label}</Text>
                    <TextInput
                      style={styles.input}
                      value={settings[p.key]}
                      keyboardType="numeric"
                      onChangeText={v => setSettings(s => ({...s, [p.key]: v}))}
                    />
                    <Pressable
                      disabled={!isEnabled}
                      onPress={() => setSettings(s => ({...s, defaultPlan: p.mask}))}
                      style={[styles.defBtn, isDefault && styles.defBtnAct, !isEnabled && { opacity: 0.2 }]}
                    >
                      <Text style={styles.defText}>{isDefault ? 'Default ✓' : 'Set Default'}</Text>
                    </Pressable>
                  </View>
                )
              })}

              <Pressable style={styles.saveBtn} onPress={saveOnChain} disabled={saving}>
                {saving ? <ActivityIndicator color="#000"/> : <Text style={styles.saveBtnText}>Save Settings on-chain</Text>}
              </Pressable>
              <Pressable onPress={() => setIsEditing(false)} style={{ marginTop: 15, alignItems: 'center' }}><Text style={{ color: '#475569' }}>Cancel</Text></Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#08090F' },
  safeArea: { flex: 1 },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 24, alignItems: 'center' },
  headerTitle: { color: '#94A3B8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  slugText: { color: '#2DD4BF', fontSize: 18, fontWeight: '800' },
  logoutTxt: { color: '#EF4444', fontWeight: '600', fontSize: 14 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  walletCard: { backgroundColor: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 24, marginBottom: 25, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  walletHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  walletLabel: { color: '#475569', fontSize: 10, fontWeight: '700' },
  networkTag: { color: '#2DD4BF', fontSize: 10, fontWeight: '700' },
  balancesRow: { flexDirection: 'row', justifyContent: 'space-between' },
  balItem: { alignItems: 'center' },
  balVal: { color: '#F8FAFC', fontSize: 22, fontWeight: '900' },
  balUnit: { color: '#94A3B8', fontSize: 10, fontWeight: '700' },
  sectionCard: { backgroundColor: 'rgba(255,255,255,0.02)', padding: 24, borderRadius: 24, marginBottom: 25 },
  sectionTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '700', marginBottom: 15 },
  sumText: { color: '#94A3B8', fontSize: 14, marginBottom: 8 },
  editMainBtn: { height: 56, borderRadius: 16, overflow: 'hidden', marginTop: 15 },
  btnGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  withdrawCard: { backgroundColor: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardSmallLabel: { color: '#475569', fontSize: 10, fontWeight: '700', marginBottom: 5 },
  treasuryVal: { color: '#F8FAFC', fontSize: 24, fontWeight: '800' },
  withdrawBtn: { backgroundColor: '#1F2937', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  withdrawBtnText: { color: '#F8FAFC', fontWeight: '700', fontSize: 12 },
  editSection: { paddingBottom: 20 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, backgroundColor: 'rgba(255,255,255,0.02)', padding: 15, borderRadius: 16 },
  label: { color: '#F8FAFC', fontSize: 15 },
  priceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  pLabel: { color: '#94A3B8', width: 55, fontSize: 13 },
  input: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', height: 44, borderRadius: 12, color: '#FFF', textAlign: 'center', fontWeight: '700' },
  defBtn: { paddingHorizontal: 10, height: 44, justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  defBtnAct: { backgroundColor: '#2DD4BF' },
  defText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  saveBtn: { backgroundColor: '#2DD4BF', height: 58, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginTop: 25 },
  saveBtnText: { color: '#08090F', fontWeight: '900', fontSize: 16 }
})
