import { HistoryEditor } from "./HistoryEditor";
import TextField from "@mui/material/TextField";
import { useInventorySummary } from "../inventory-summary";
import type { Command } from "../domain/commands";
import { useState, useMemo } from "react";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import SvgIcon from "@mui/material/SvgIcon";
import Tooltip from "@mui/material/Tooltip";
import { DirectMealDetail } from "./DirectMealDetail";
import { HistoryDetailRow } from "./HistoryDetailRow";
import { HistoryText } from "./HistoryText";
import { mealCost, type State } from "../domain/inventory";
import { money, number, dateLabel } from "../format";

export type HistoryType = "purchase" | "meal" | "cooking";
export type HistoryProps = {
  saving: boolean;
  state: State;
  today: string;
  type: HistoryType;
  onSave: (command: Command, message: string) => Promise<void>;
};

export function History({
  state,
  today,
  type,
  onSave,
  saving,
  all = false,
  onShowAll,
}: HistoryProps & {
  all?: boolean;
  onShowAll?: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const kind = { purchase: "購入", meal: "食事", cooking: "料理" }[type];
  const title = `${kind}履歴`;
  const summary = useInventorySummary(state);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const { purchases, meals, cookings } = useMemo(() => {
    const productNames = new Map(state.products.map((p) => [p.id, p.name]));
    const cookingNames = new Map(state.cookings.map((c) => [c.id, c.name]));
    const matches = (date: string, text: string) =>
      !all ||
      ((!from || date >= from) &&
        (!until || date <= until) &&
        query
          .normalize("NFKC")
          .toLocaleLowerCase()
          .trim()
          .split(/\s+/)
          .every((part) =>
            text.normalize("NFKC").toLocaleLowerCase().includes(part),
          ));
    const productName = (id: string) => productNames.get(id) ?? "";
    const cookingName = (id: string) => cookingNames.get(id) ?? "";
    const purchases = state.purchases
      .filter(
        (p) => !p.adjustmentId && matches(p.date, productName(p.productId)),
      )
      .reverse()
      .sort((a, b) => b.date.localeCompare(a.date));
    const meals = state.meals
      .filter((m) =>
        matches(
          m.date,
          [
            m.kind,
            m.direct?.note,
            m.direct?.place,
            ...m.usages.map((u) => productName(u.productId)),
            ...(m.prepared ?? []).map((p) => cookingName(p.batchId)),
          ].join(" "),
        ),
      )
      .reverse()
      .sort((a, b) => b.date.localeCompare(a.date));
    const cookings = state.cookings
      .filter((c) =>
        matches(
          c.date,
          [c.name, ...c.usages.map((u) => productName(u.productId))].join(" "),
        ),
      )
      .reverse()
      .sort((a, b) => b.date.localeCompare(a.date));
    return { purchases, meals, cookings };
  }, [state, all, query, from, until]);
  const count = { purchase: purchases, meal: meals, cooking: cookings }[type]
    .length;
  const totalCount = {
    purchase: state.purchases.filter((p) => !p.adjustmentId),
    meal: state.meals,
    cooking: state.cookings,
  }[type].length;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(count / 20) - 1));
  const start = all ? currentPage * 20 : 0;
  const end = all ? start + 20 : 5;
  return (
    <section className="history-section" aria-label={title}>
      {!all && (
        <div className="section-heading">
          <h2>{title}</h2>
          {totalCount > 5 && onShowAll && (
            <Button onClick={onShowAll}>すべて見る</Button>
          )}
        </div>
      )}
      {all && (
        <div className="history-filters">
          <TextField
            label="履歴を探す"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          <div className="two-columns">
            <TextField
              label="開始日"
              type="date"
              value={from}
              slotProps={{ inputLabel: { shrink: true } }}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(0);
              }}
            />
            <TextField
              label="終了日"
              type="date"
              value={until}
              slotProps={{ inputLabel: { shrink: true } }}
              onChange={(e) => {
                setUntil(e.target.value);
                setPage(0);
              }}
            />
          </div>
        </div>
      )}
      {count === 0 && (
        <p className="empty">
          {totalCount
            ? "一致する記録がありません。"
            : `まだ${kind}の記録がありません。`}
        </p>
      )}
      {type === "purchase"
        ? purchases.slice(start, end).map((p) => (
            <div className="purchase-row history-row" key={p.id}>
              <div>
                <strong>
                  <HistoryText>
                    {state.products.find((v) => v.id === p.productId)?.name}
                  </HistoryText>
                </strong>
                <p className="hint">
                  <HistoryText>
                    {dateLabel(p.date)} · {number(p.quantity)}
                    {p.unit}
                  </HistoryText>
                </p>
              </div>
              <div className="numeric purchase-history-actions">
                <strong>{money(p.price)}</strong>
                <Tooltip title="購入履歴を編集">
                  <IconButton
                    disabled={saving}
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
        : type === "meal"
          ? meals.slice(start, end).map((m) => (
              <div className="meal-history-row" key={m.id}>
                <details className="meal-row">
                  <summary>
                    <strong>
                      <HistoryText>
                        {dateLabel(m.date)} · {m.kind}
                      </HistoryText>
                    </strong>
                    <span>
                      {m.direct && !m.usages.length && !m.prepared?.length
                        ? "金額入力"
                        : `${m.usages.length + (m.prepared?.length ?? 0) + (m.direct ? 1 : 0)}品`}
                    </span>
                    <strong className="numeric">{money(mealCost(m))}</strong>
                  </summary>
                  <div className="meal-detail">
                    {m.direct && <DirectMealDetail direct={m.direct} />}
                    {m.usages.map((u) => (
                      <HistoryDetailRow
                        key={u.productId}
                        value={money(
                          u.allocations.reduce((sum, a) => sum + a.cost, 0),
                        )}
                      >
                        {state.products.find((p) => p.id === u.productId)?.name}{" "}
                        {number(u.quantity)}
                        {u.unit}
                      </HistoryDetailRow>
                    ))}
                    {(m.prepared ?? []).map((p) => (
                      <HistoryDetailRow key={p.batchId} value={money(p.cost)}>
                        {state.cookings.find((c) => c.id === p.batchId)?.name}{" "}
                        {number(p.quantity)}食分
                      </HistoryDetailRow>
                    ))}
                  </div>
                </details>
                <Tooltip title="食事履歴を編集">
                  <IconButton
                    className="meal-history-edit"
                    disabled={saving}
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
            ))
          : cookings.slice(start, end).map((c) => (
              <div className="meal-history-row cooking-history-row" key={c.id}>
                <details className="meal-row">
                  <summary>
                    <strong>
                      <HistoryText>{c.name}</HistoryText>
                    </strong>
                    <span>{dateLabel(c.date)}</span>
                    <strong className="numeric">
                      {number(c.servings)}食分
                    </strong>
                  </summary>
                  <div className="meal-detail">
                    <HistoryDetailRow
                      value={`${number(summary.cookings.get(c.id)!.quantity / 1000)}食分`}
                    >
                      残量
                    </HistoryDetailRow>
                    {c.usages.map((u) => (
                      <HistoryDetailRow
                        key={u.productId}
                        value={`${number(u.quantity)}${u.unit}`}
                      >
                        {state.products.find((p) => p.id === u.productId)?.name}
                      </HistoryDetailRow>
                    ))}
                  </div>
                </details>
                <Tooltip title="料理履歴を編集">
                  <IconButton
                    className="meal-history-edit"
                    disabled={saving}
                    onClick={() => setEditingId(c.id)}
                    aria-label={`${dateLabel(c.date)} ${c.name}の履歴を編集`}
                    sx={{ width: 44, height: 44, flexShrink: 0 }}
                  >
                    <SvgIcon fontSize="small">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                    </SvgIcon>
                  </IconButton>
                </Tooltip>
              </div>
            ))}
      {all && count > 20 && (
        <div className="history-pagination">
          <Button
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            前へ
          </Button>
          <span>
            {currentPage + 1} / {Math.ceil(count / 20)}
          </span>
          <Button
            disabled={end >= count}
            onClick={() => setPage(currentPage + 1)}
          >
            次へ
          </Button>
        </div>
      )}
      {editingId && (
        <HistoryEditor
          key={editingId}
          id={editingId}
          type={type}
          state={state}
          today={today}
          saving={saving}
          onClose={() => setEditingId(null)}
          onSave={onSave}
        />
      )}
    </section>
  );
}
