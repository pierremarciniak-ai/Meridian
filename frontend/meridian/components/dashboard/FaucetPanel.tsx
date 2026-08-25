"use client";

import { useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { AnchorIcon } from "@/components/icons";
import { TxStatusLine } from "@/components/TxStatusLine";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Currency, currencyLabels } from "@/lib/domain/enums";
import { parseAmountInput } from "@/lib/domain/format";
import { useContractAction } from "@/hooks/useContractAction";
import { useErc20Meta } from "@/hooks/useErc20";
import { useTokenAddresses } from "@/hooks/useTokenAddresses";
import { erc20Abi } from "@/lib/web3/abi/erc20";

/**
 * Robinet de jetons de test. Les MockERC20 déployés en local exposent un
 * `mint()` public, sans restriction (voir contracts/mocks/MockERC20.sol) :
 * un simple robinet suffit ici pour tester le cycle de dépôt/retrait sans
 * dépendre du script de déploiement.
 */
export function FaucetPanel() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [currency, setCurrency] = useState<Currency>(Currency.USDC);
  const [amountInput, setAmountInput] = useState("1000");
  const { tokenAddresses } = useTokenAddresses();
  const tokenAddress = tokenAddresses[currency];
  const { decimals, symbol } = useErc20Meta(tokenAddress);
  const { execute, stage, error, isBusy, isSuccess } = useContractAction();

  async function handleMint() {
    if (!address || !tokenAddress) return;
    await execute({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "mint",
      args: [address, parseAmountInput(amountInput, decimals)],
    });
  }

  // wallet_watchAsset (EIP-747) : le dApp ne peut pas savoir si le token est
  // déjà listé dans le wallet (aucune API pour le lire, pour des raisons de
  // vie privée), donc on le propose systématiquement après un mint réussi —
  // MetaMask gère lui-même le cas où il l'a déjà (pas de doublon créé).
  useEffect(() => {
    if (!isSuccess || !walletClient || !tokenAddress) return;
    walletClient
      .watchAsset({
        type: "ERC20",
        options: { address: tokenAddress, decimals, symbol: symbol || "TOKEN" },
      })
      .catch(() => {
        // Wallet sans support de wallet_watchAsset, ou refus de l'utilisateur : non bloquant.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Robinet de jetons de test</CardTitle>
        <AnchorIcon className="h-6 w-6 text-subtle" />
      </CardHeader>
      <p className="mb-4 text-sm text-muted">
        Réseau de développement uniquement : créditez votre portefeuille en USDC / USDT / EURC de test pour simuler un dépôt.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Devise">
          <select className="field-select" value={currency} onChange={(e) => setCurrency(Number(e.target.value) as Currency)}>
            {Object.values(Currency)
              .filter((v) => typeof v === "number")
              .map((v) => (
                <option key={v} value={v}>
                  {currencyLabels[v as Currency]}
                </option>
              ))}
          </select>
        </Field>
        <Field label={`Montant (${symbol || "…"})`}>
          <input className="field-input" inputMode="decimal" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} />
        </Field>
        <Button variant="brass" onClick={handleMint} loading={isBusy} disabled={!isConnected || !tokenAddress}>
          Créditer
        </Button>
      </div>
      <div className="mt-3">
        <TxStatusLine stage={stage} error={error} />
      </div>
    </Card>
  );
}
