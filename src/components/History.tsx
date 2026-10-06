import { useState } from "react";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import SvgIcon from "@mui/material/SvgIcon";
import Tooltip from "@mui/material/Tooltip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import { PurchaseForm } from "./PurchaseForm";
import { MealForm } from "./MealForm";
import { mealCost, updateProductUnits, type State } from "../domain/inventory";
import { money, number, dateLabel } from "../format";

export function History({
  state,
  today,
  type,
  onSave,
}: {
  state: State;
  today: string;
  type: "purchase" | "meal";
  onSave: (next: State, message: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [page, setPage] = useState(0);
  const title = type === "purchase" ? "購入履歴" : "食事履歴";
  const purchases = state.purchases
    .filter((p) => !p.adjustmentId)
    .reverse()
    .sort((a, b) => b.date.localeCompare(a.date));
  const meals = [...state.meals]
    .reverse()
    .sort((a, b) => b.date.localeCompare(a.date));
  const count = type === "purchase" ? purchases.length : meals.length;
  const start = all ? page * 20 : 0;
  const end = all ? start + 20 : 5;
  const purchase = purchases.find((p) => p.id === editingId);
  const meal = meals.find((m) => m.id === editingId);
  const save = (next: State) => {
    onSave(
      next,
      type === "purchase" ? "購入履歴を更新しました" : "食事履歴を更新しました",
    );
    setEditingId(null);
  };
  return (
    <section className="history-section" aria-label={title}>
      <div className="section-heading">
        <h2>{title}</h2>
        {count > 5 && (
          <Button
            onClick={() => {
              setAll(!all);
              setPage(0);
            }}
          >
            {all ? "最近の履歴" : "すべて見る"}
          </Button>
        )}
      </div>
      {count === 0 && (
        <p className="empty">
          まだ{type === "purchase" ? "購入" : "食事"}の記録がありません。
        </p>
      )}
      {type === "purchase"
        ? purchases.slice(start, end).map((p) => (
            <div className="purchase-row history-row" key={p.id}>
              <div>
                <strong>
                  {state.products.find((v) => v.id === p.productId)?.name}
                </strong>
                <p className="hint">
                  {dateLabel(p.date)} · {number(p.quantity)}
                  {p.unit}
                </p>
              </div>
              <div className="numeric purchase-history-actions">
                <strong>{money(p.price)}</strong>
                <Tooltip title="購入履歴を編集">
                  <IconButton
                    onClick={() => setEditingId(p.id)}
                    aria-label={`${dateLabel(p.date)}の購入履歴を編集`}
                    sx={{ width: 44, height: 44, flexShrink: 0 }}
                  >
                    <SvgIcon fontSize="small">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                    </SvgIcon>
                  </IconButton>
                </Tooltip>
              </div>
            </div>
          ))
        : meals.slice(start, end).map((m) => (
            <details className="meal-row" key={m.id}>
              <summary>
                <strong>
                  {dateLabel(m.date)} · {m.kind}
                </strong>
                <span>
                  {m.batch?.name ??
                    `${m.usages.length + (m.prepared?.length ?? 0)}品`}
                </span>
                <strong className="numeric">{money(mealCost(m))}</strong>
              </summary>
              <div className="meal-detail">
                {m.usages.map((u) => (
                  <div key={u.productId}>
                    <span>
                      {state.products.find((p) => p.id === u.productId)?.name}{" "}
                      {number(u.quantity)}
                      {u.unit}
                    </span>
                    <span>
                      {money(u.allocations.reduce((sum, a) => sum + a.cost, 0))}
                    </span>
                  </div>
                ))}
                {(m.prepared ?? []).map((p) => (
                  <div key={p.batchId}>
                    <span>
                      {state.meals.find((m) => m.id === p.batchId)?.batch?.name}{" "}
                      {number(p.quantity)}食分
                    </span>
                    <span>{money(p.cost)}</span>
                  </div>
                ))}
                {m.batch && (
                  <p className="hint">
                    作った量 {number(m.batch.servings)}食分 · 今回食べた量{" "}
                    {number(m.batch.eatenServings)}食分
                  </p>
                )}
                <Tooltip title="食事履歴を編集">
                  <IconButton
                    onClick={() => setEditingId(m.id)}
                    aria-label={`${dateLabel(m.date)} ${m.kind}の履歴を編集`}
                    sx={{ width: 44, height: 44, flexShrink: 0 }}
                  >
                    <SvgIcon fontSize="small">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                    </SvgIcon>
                  </IconButton>
                </Tooltip>
              </div>
            </details>
          ))}
      {all && count > 20 && (
        <div className="history-pagination">
          <Button disabled={page === 0} onClick={() => setPage(page - 1)}>
            前へ
          </Button>
          <span>
            {page + 1} / {Math.ceil(count / 20)}
          </span>
          <Button disabled={end >= count} onClick={() => setPage(page + 1)}>
            次へ
          </Button>
        </div>
      )}
      <Dialog
        open={!!editingId}
        onClose={() => setEditingId(null)}
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
        <DialogContent>
          {purchase && type === "purchase" && (
            <PurchaseForm
              key={purchase.id}
              editing={purchase}
              state={state}
              today={today}
              onCancel={() => setEditingId(null)}
              onSave={save}
              onCreateProduct={(product) => {
                if (state.products.some((p) => p.name === product.name))
                  throw new Error("同じ名前の食材が登録されています");
                onSave(
                  { ...state, products: [...state.products, product] },
                  "食材を追加しました",
                );
              }}
              onAddUnit={(product, unit) =>
                onSave(
                  updateProductUnits(state, product.id, [
                    ...product.units,
                    unit,
                  ]),
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
              onCancel={() => setEditingId(null)}
              onSave={save}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
