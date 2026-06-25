// the format as is stored in db
export type zkmlDeserialized = {
    proof: string,
    settings: string,
    verification_key: string,
}

export type zkmlSerialized = {
    proof: Uint8ClampedArray,
    settings: Uint8ClampedArray,
    verification_key: Uint8ClampedArray,
}