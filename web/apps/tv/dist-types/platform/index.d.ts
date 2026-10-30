export type PlatformId = "webos" | "tizen" | "browser";
/** Which TV the page runs on; decides the key registration and the packaging, nothing else. */
export declare function detectPlatform(ua?: string): PlatformId;
/** Tizen delivers some remote keys only after they are registered. */
export declare function registerRemoteKeys(platform: PlatformId): void;
