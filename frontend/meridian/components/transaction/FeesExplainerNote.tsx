/**
 * Détaille le mécanisme renvoyé par l'astérisque accolé au montant de frais
 * de service dans CreateShipmentForm et DetailsForm — sorti du hint du
 * champ "Montant total" pour ne pas l'alourdir avec une phrase complète à
 * chaque frappe. Contenu volontairement identique acheteur/fournisseur : les
 * deux ont besoin de comprendre le même mécanisme (voir
 * `transfertFeesFromBuyer` dans InternalFunctions.sol).
 */
export function FeesExplainerNote() {
  return (
    <p className="info-note">
      * L&apos;acheteur paie la totalité des frais de service à la signature, mais ne dépose que le montant total moins
      la moitié de ces frais. Par conséquent, lors de son premier retrait, le fournisseur perçoit un montant dont sa
      part de frais est déjà déduite.
    </p>
  );
}
