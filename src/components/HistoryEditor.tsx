import type { Command } from "../domain/commands";
import { useState, useRef } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import { PurchaseForm } from "./PurchaseForm";
import { MealForm } from "./MealForm";
import { PreparedForm } from "./PreparedForm";
import { type State } from "../domain/inventory";
import { money } from "../format";

import DialogActions from "@mui/material/DialogActions";
export function HistoryEditor({
  state,
  today,
  type,
  id,
  onClose,
  onSave,
  saving,
}: {
  state: State;
  today: string;
  type: "purchase" | "meal" | "cooking";
  id: string;
  onClose: () => void;
  onSave: (command: Command, message: string) => Promise<void>;
  saving: boolean;
}) {
  const kind = { purchase: "購入", meal: "食事", cooking: "料理" }[type];
  const title = `${kind}履歴`;
  const purchase = state.purchases.find((p) => p.id === id);
  const meal = state.meals.find((m) => m.id === id);
  const cooking = state.cookings.find((c) => c.id === id);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const deleting = useRef(false);
  const save = async (next: Command) => {
    await onSave(next, `${kind}の記録を更新しました`);
    onClose();
  };
  async function remove() {
    if (deleting.current || saving) return;
    deleting.current = true;
    setError("");
    try {
      const command: Command = {
        type:
          type === "cooking"
            ? "prepared.delete"
            : type === "purchase"
              ? "purchase.delete"
              : "meal.delete",
        id,
      };
      await onSave(command, `${kind}の記録を削除しました`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除できませんでした");
    } finally {
      deleting.current = false;
    }
  }
  return (
    <>
      <Dialog
        open={!!id}
        onClose={() => {
          if (!saving) onClose();
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="history-edit-title"
        slotProps={{
          paper: {
            sx: {
              margin: { xs: 2, sm: 4 },
              width: { xs: "calc(100% - 32px)", sm: "calc(100% - 64px)" },
            },
          },
        }}
      >
        <DialogTitle id="history-edit-title">{title}を編集</DialogTitle>
        <DialogContent sx={{ "&&": { paddingTop: 1.5 } }}>
          {purchase && type === "purchase" && (
            <PurchaseForm
              key={purchase.id}
              editing={purchase}
              state={state}
              today={today}
              onCancel={() => onClose()}
              onSave={save}
              onCreateProduct={async (product) => {
                if (state.products.some((p) => p.name === product.name))
                  throw new Error("同じ名前の食材が登録されています");
                await onSave(
                  { type: "product.create", product },
                  "食材を追加しました",
                );
              }}
              onAddUnit={(product, unit) =>
                onSave(
                  {
                    type: "product.update",
                    id: product.id,
                    name: product.name,
                    units: [...product.units, unit],
                  },
                  "単位を追加しました",
                )
              }
            />
          )}
          {meal && type === "meal" && (
            <MealForm
              key={meal.id}
              editing={meal}
              state={state}
              today={today}
              money={money}
              onCancel={() => onClose()}
              onSave={save}
            />
          )}
          {cooking && type === "cooking" && (
            <PreparedForm
              key={cooking.id}
              editing={cooking}
              state={state}
              today={today}
              showCost={false}
              onCancel={() => onClose()}
              onSave={save}
            />
          )}
          <div className="history-delete-action">
            <Button
              color="error"
              disabled={saving}
              onClick={() => {
                setError("");
                setConfirming(true);
              }}
            >
              この記録を削除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={confirming}
        onClose={() => {
          if (!saving) setConfirming(false);
        }}
        aria-labelledby="delete-record-title"
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle id="delete-record-title">
          {kind}の記録を削除しますか？
        </DialogTitle>
        <DialogContent>
          <p>元に戻せません。</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={saving} onClick={() => setConfirming(false)}>
            キャンセル
          </Button>
          <Button color="error" disabled={saving} onClick={remove}>
            削除
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
