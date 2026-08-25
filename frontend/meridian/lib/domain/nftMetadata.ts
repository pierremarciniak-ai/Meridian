export type NftAttribute = { trait_type: string; value: string | number };

export type NftMetadata = {
  name: string;
  description: string;
  attributes: NftAttribute[];
};

const DATA_URI_PREFIX = "data:application/json;base64,";

/**
 * Décode une tokenURI NFT (data URI JSON base64, voir `buildTokenURI` dans
 * MeridianNFT.sol). Passe par `TextDecoder` plutôt qu'un simple `atob()`,
 * qui interprète le résultat en Latin1 et corromprait tout caractère
 * accentué saisi par l'utilisateur (billNumber, containerReference) — le
 * contrat encode le JSON en UTF-8 avant base64.
 */
export function decodeTokenUri(uri: string | undefined): NftMetadata | undefined {
  if (!uri || !uri.startsWith(DATA_URI_PREFIX)) return undefined;
  try {
    const binary = atob(uri.slice(DATA_URI_PREFIX.length));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as NftMetadata;
  } catch {
    return undefined;
  }
}
