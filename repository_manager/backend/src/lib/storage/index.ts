// Storage manager: start small and ensure ESM imports include .js suffix for node
// Debashish Buragohain

import { PinataProvider } from '../ipfs/pinata.js';
import type { StorageProvider, AddResult, AddOptions, GetCIDResponse } from './types.js';

// Minimal facade for now: export the default provider and helper passthroughs
export function getDefaultProvider(): StorageProvider {
  return new PinataProvider() as StorageProvider;
}

export async function add(content: Buffer | NodeJS.ReadableStream | object | string, opts?: AddOptions): Promise<AddResult> {
  return getDefaultProvider().add(content as any, opts);
}

export async function get(cid: string): Promise<GetCIDResponse> {
  const p = getDefaultProvider();
  if (!p.get) throw new Error(`${p.name} does not implement get()`);
  return p.get(cid) as Promise<GetCIDResponse>;
}

export async function remove(cid: string): Promise<string | void> {
  const p = getDefaultProvider();
  if (!p.remove) throw new Error(`${p.name} does not implement remove()`);
  return p.remove(cid);
}

export default {
  getDefaultProvider,
  add,
  get,
  remove,
};