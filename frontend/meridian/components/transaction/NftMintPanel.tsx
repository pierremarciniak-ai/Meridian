"use client";

import { useEffect } from "react";
import { CopyChip } from "@/components/CopyChip";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatAmount, formatUnixDate } from "@/lib/domain/format";
import { decodeTokenUri, type NftAttribute } from "@/lib/domain/nftMetadata";
import type { OnChainTransaction } from "@/lib/domain/transaction";
import { useContractAction } from "@/hooks/useContractAction";
import { useErc20Meta } from "@/hooks/useErc20";
import { useMeridianNFTAddress } from "@/hooks/useMeridianNFTAddress";
import { useNftTokenId, useNftTokenUri } from "@/hooks/useNftReceipt";
import { useTokenAddresses } from "@/hooks/useTokenAddresses";
import { meridianAbi } from "@/lib/web3/abi/meridian";
import { useMeridianAddress } from "@/lib/web3/contracts";

// Les attributs "date" et "montant" du JSON on-chain sont bruts (timestamp
// Unix, montant sans division par les decimals — voir buildTokenURI dans
// MeridianNFT.sol) : on les reformate ici pour l'affichage, comme partout
// ailleurs dans l'app (formatUnixDate/formatAmount).
const DATE_TRAITS = new Set(["Expiration Date"]);
const AMOUNT_TRAITS = new Set(["Advance Amount", "Total Amount"]);

function formatAttrValue(attr: NftAttribute, decimals: number, symbol: string): string {
  if (DATE_TRAITS.has(attr.trait_type)) return formatUnixDate(BigInt(attr.value));
  if (AMOUNT_TRAITS.has(attr.trait_type)) return `${formatAmount(BigInt(attr.value), decimals)} ${symbol}`;
  return String(attr.value);
}

function AttrRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-xs text-subtle">{label}</span>
      <span className="text-right text-xs text-foam">{value}</span>
    </div>
  );
}

// Visible une fois la transaction signée (les deux parties sont fixées) et
// jusqu'à la fin du cycle : chaque partie mint son propre NFT récapitulatif,
// indépendamment du dépôt/retrait des fonds.
export function NftMintPanel({
  transactionId,
  tx,
  role,
  onMinted,
}: {
  transactionId: `0x${string}`;
  tx: OnChainTransaction;
  role: "buyer" | "seller";
  onMinted: () => void;
}) {
  const meridianAddress = useMeridianAddress();
  const { execute, stage, error, isBusy, isSuccess } = useContractAction();

  useEffect(() => {
    if (isSuccess) onMinted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const alreadyMinted = role === "buyer" ? tx.buyerNFTMinted : tx.sellerNFTMinted;
  const holderAddress = role === "buyer" ? tx.buyer.userAddress : tx.seller.userAddress;

  const { data: meridianNFTAddress, isLoading: isNftAddressLoading } = useMeridianNFTAddress();
  const { tokenId, isLoading: isTokenIdLoading } = useNftTokenId(transactionId, holderAddress, alreadyMinted);
  const { data: tokenUri, isLoading: isUriLoading } = useNftTokenUri(meridianNFTAddress, tokenId);
  const metadata = decodeTokenUri(tokenUri as string | undefined);
  const { tokenAddresses } = useTokenAddresses();
  const { decimals, symbol } = useErc20Meta(tokenAddresses[tx.currency]);
  const isReceiptLoading = isNftAddressLoading || isTokenIdLoading || isUriLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reçu NFT</CardTitle>
      </CardHeader>

      {!alreadyMinted && (
        <p className="mb-4 text-sm text-muted">
          Mintez un NFT récapitulant ce dossier (montants, conditions, dates) à votre nom, à titre de reçu on-chain.
        </p>
      )}

      {alreadyMinted ? (
        <>
          {isReceiptLoading && <p className="text-sm text-subtle">Chargement du reçu…</p>}

          {!isReceiptLoading && metadata && (
            <div className="rounded-lg p-4" style={{ background: "var(--color-navy-900)", border: "1px solid var(--color-navy-600)" }}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foam">{metadata.name}</span>
                <CopyChip label="NFT ID" value={meridianNFTAddress!} />
              </div>
              <p className="mb-3 text-xs text-subtle">{metadata.description}</p>
              <div className="divide-y" style={{ borderColor: "var(--color-navy-700)" }}>
                {metadata.attributes.map((attr) => (
                  <AttrRow key={attr.trait_type} label={attr.trait_type} value={formatAttrValue(attr, decimals, symbol)} />
                ))}
              </div>
            </div>
          )}

          {!isReceiptLoading && !metadata && (
            <p className="text-sm" style={{ color: "#86efac" }}>
              Déjà minté.
            </p>
          )}
        </>
      ) : (
        <>
          <TxStatusLine stage={stage} error={error} />
          <Button
            variant="secondary"
            className="mt-2"
            loading={isBusy}
            disabled={!meridianAddress}
            onClick={() =>
              meridianAddress &&
              execute({
                address: meridianAddress,
                abi: meridianAbi,
                functionName: role === "buyer" ? "mintTransactionNFTBuyer" : "mintTransactionNFTSeller",
                args: [transactionId],
              })
            }
          >
            Minter mon reçu NFT
          </Button>
        </>
      )}
    </Card>
  );
}
