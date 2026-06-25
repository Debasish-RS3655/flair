// interface for the storage providers
// Debashish Buragohain

import { Stream } from 'stream';

export interface AddResult { cid: string; size?: number; raw?: any; provider?: string }

export interface AddOptions { pin?: boolean; metadata?: Record<string, any> }

export type ContentType = "application/json" | "application/xml" | "text/plain" | "text/html" | "text/css" | "text/javascript" | "application/javascript" | "image/jpeg" | "image/png" | "image/gif" | "image/svg+xml" | "audio/mpeg" | "audio/ogg" | "video/mp4" | "application/pdf" | "application/octet-stream" | string | null;

export type GetCIDResponse = {
    data?: JSON | string | Blob | null;
    contentType: ContentType;
}

export interface StorageProvider {
    name: string;
    add(content: Buffer | Stream | object | string, opts?: AddOptions): Promise<AddResult>;
    remove?(cid: string): Promise<string | void>;
    get?(cid: string): Promise<GetCIDResponse>;
} 