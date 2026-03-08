import { PublicKey } from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha256';
import { Buffer } from 'buffer';

export const PROGRAM_ID = new PublicKey('D77py83PcmD74E1Zgd4YBdY3eKkkYb7kx2Mbbss7WsG6');
export const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'); // Devnet USDC
export const HAHICO_MINT = new PublicKey('675ZDE9S6AL9p9EiCcSjUgABZAh966S2ZpYshCfEgFe9'); // HAHICO Mint

export function slugToHash32(slug: string): Uint8Array {
  const s = slug.trim().toLowerCase();
  const bytes = new TextEncoder().encode(s);
  return sha256(bytes);
}

export function getMerchantVaultPda(merchantPk: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('merchant_v2'), merchantPk.toBuffer()],
    PROGRAM_ID
  );
}

export function getMerchantRegistryPda(slugHash: Uint8Array) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('merchant_registry'), Buffer.from(slugHash)],
    PROGRAM_ID
  );
}

export function getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA').toBuffer(), mint.toBuffer()],
    new PublicKey('ATokenGPvbdQxrxtJvZ17GiEn2uHAHF9uYhBksARnr')
  )[0];
}

export function disc8(name: string): Buffer {
  const bytes = new TextEncoder().encode(`global:${name}`);
  return Buffer.from(sha256(bytes).slice(0, 8));
}
