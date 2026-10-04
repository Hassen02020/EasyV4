-- J5 CRM→Supplier : lien structurel lead → supplier_node
-- Nullable : les leads existants (classiques myGo, vol, etc.) restent intacts,
-- NULL = fournisseur non identifié (comportement historique inchangé).
-- Additive uniquement — aucune ligne existante modifiée.

ALTER TABLE leads
  ADD COLUMN supplier_node_id uuid,
  ADD CONSTRAINT leads_supplier_node_id_fkey
    FOREIGN KEY (supplier_node_id)
    REFERENCES supplier_nodes(id)
    ON DELETE SET NULL;

CREATE INDEX leads_supplier_node_idx
  ON leads (supplier_node_id)
  WHERE supplier_node_id IS NOT NULL;
