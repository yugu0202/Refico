import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import SvgIcon from "@mui/material/SvgIcon";
import TextField from "@mui/material/TextField";
import { useEffect, useState } from "react";
import {
  dailyCosts,
  emptyState,
  mealCost,
  preparedRemaining,
  updateProductUnits,
  updateProduct,
  type State,
  type Product,
} from "./domain/inventory";
import { loadState, saveState } from "./domain/storage";
import { sampleState } from "./domain/sample";
import { ProductForm } from "./components/ProductForm";
import { PurchaseForm } from "./components/PurchaseForm";
import { MealForm } from "./components/MealForm";
import { StockAdjustmentForm } from "./components/StockAdjustmentForm";
import { InventoryRow } from "./components/InventoryRow";
import { money, number, localDate, dateLabel } from "./format";
const navigation = [
  {
    id: "home",
    label: "ホーム",
    shortLabel: "ホーム",
    icon: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
  },
  {
    id: "inventory",
    label: "在庫",
    shortLabel: "在庫",
    icon: "M6 3h12v18H6zM6 10h12M9 6v1M9 13v3",
  },
  {
    id: "purchase",
    label: "購入を記録",
    shortLabel: "購入",
    icon: "M3 9h18l-2 12H5L3 9ZM8 9l4-6 4 6M9 13v4M15 13v4",
  },
  {
    id: "meal",
    label: "食事を記録",
    shortLabel: "食事",
    icon: "M5 3v5a3 3 0 0 0 6 0V3M8 3v18M19 3c-3 2-4 5-4 9h4M19 3v18",
  },
] as const;
type Page = (typeof navigation)[number]["id"];
export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [today, setToday] = useState(localDate);
  const [state, setState] = useState<State>(emptyState);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(
    null,
  );
  const [search, setSearch] = useState("");
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [page]);
  useEffect(() => {
    try {
      setState(loadState());
      setReady(true);
    } catch (e) {
      setStorageError(
        e instanceof Error ? e.message : "保存データを読み込めません",
      );
    }
    const refresh = () => setToday(localDate());
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  function persist(next: State, message: string) {
    // Save first so a failed/quota-blocked write cannot appear successful.
    try {
      saveState(next);
    } catch {
      throw new Error(
        "保存できませんでした。ブラウザの保存設定と空き容量を確認してください",
      );
    }
    setState(next);
    setNotice(message);
  }
  function navigate(next: Page) {
    setPage(next);
    setEditingProduct(null);
    setAdjustingProduct(null);
    setNotice("");
  }
  function saveProduct(product: Product) {
    if (state.products.some((p) => p.name === product.name))
      throw new Error("同じ名前の食材が登録されています");
    persist(
      { ...state, products: [...state.products, product] },
      `${product.name}を追加しました`,
    );
  }
  const meals = state.meals.filter(
    (m) => m.date === today && (!m.batch || m.batch.eatenServings > 0),
  );
  const total = meals.reduce((sum, m) => sum + mealCost(m), 0);
  const filtered = state.products.filter((p) => p.name.includes(search));
  const prepared = state.meals.filter(
    (m) => m.batch && preparedRemaining(state, m) > 0,
  );
  const filteredPrepared = prepared.filter((m) =>
    m.batch!.name.includes(search),
  );
  const preparedRows = (items: typeof prepared) =>
    items.map((m) => {
      const remaining = preparedRemaining(state, m);
      return (
        <div className="inventory-row" key={m.id}>
          <div>
            <strong>{m.batch!.name}</strong>
            <p className="hint">作った日 {dateLabel(m.date)}</p>
          </div>
          <div className="numeric">
            <strong>{number(remaining)}食分</strong>

          </div>
        </div>
      );
    });
  const title = navigation.find((n) => n.id === page)!.label;
  const inventoryRows = (products: Product[]) =>
    products.map((product) => (
      <InventoryRow
        key={product.id}
        product={product}
        state={state}
        showValue={false}
        onAdjust={
          page === "inventory"
            ? () => {
                setAdjustingProduct(product);
                setNotice("");
              }
            : undefined
        }
        onEdit={
          page === "inventory"
            ? () => {
                setEditingProduct(product);
                setNotice("");
              }
            : undefined
        }
      />
    ));
  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
        >
          Refico
        </a>
        <span className="header-date">{dateLabel(today)}</span>
      </header>
      <nav className="navigation" aria-label="メインメニュー">
        {navigation.map((n) => (
          <Button
            type="button"
            key={n.id}
            aria-current={page === n.id ? "page" : undefined}
            onClick={() => navigate(n.id)}
          >
            <SvgIcon
              className="navigation-icon"
              aria-hidden="true"
              sx={{ fill: "none", stroke: "currentColor", strokeWidth: 1.8 }}
            >
              <path d={n.icon} strokeLinecap="round" strokeLinejoin="round" />
            </SvgIcon>
            <span className="navigation-label">{n.label}</span>
            <span className="navigation-short-label">{n.shortLabel}</span>
          </Button>
        ))}
      </nav>
      <main>
        <div className="page-heading">
          <h1>{title}</h1>
        </div>
        {storageError && (
          <p className="error" role="alert">
            {storageError}
          </p>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {!ready ? (
          <p className="hint">
            {storageError ? "保存データは変更していません。" : "読み込み中…"}
          </p>
        ) : (
          <>
            {adjustingProduct && (
              <StockAdjustmentForm
                key={adjustingProduct.id}
                state={state}
                product={adjustingProduct}
                today={today}
                onCancel={() => setAdjustingProduct(null)}
                onSave={(next) => {
                  persist(next, "在庫を調整しました");
                  setAdjustingProduct(null);
                }}
              />
            )}
            {editingProduct && (
              <Dialog
                open
                onClose={() => setEditingProduct(null)}
                fullWidth
                maxWidth="sm"
                aria-labelledby="product-title"
                slotProps={{
                  paper: {
                    sx: {
                      margin: { xs: 2, sm: 4 },
                      width: {
                        xs: "calc(100% - 32px)",
                        sm: "calc(100% - 64px)",
                      },
                    },
                  },
                }}
              >
                <DialogContent sx={{ paddingTop: 3 }}>
                  <ProductForm
                    embedded
                    key={editingProduct.id}
                    product={editingProduct}
                    onSave={saveProduct}
                    onSaveChanges={(name, units) => {
                      persist(
                        updateProduct(state, editingProduct.id, name, units),
                        `${name.trim()}を更新しました`,
                      );
                      setEditingProduct(null);
                    }}
                    onCancel={() => setEditingProduct(null)}
                  />
                </DialogContent>
              </Dialog>
            )}
            {page === "home" && (
              <>
                <section className="daily" aria-labelledby="daily-title">
                  <p id="daily-title" className="eyebrow">
                    今日の食費
                  </p>
                  <p className="daily-total">{money(total)}</p>
                  <div className="meal-totals">
                    {["朝食", "昼食", "夕食", "その他"].map((kind) => {
                      const entries = meals.filter((m) => m.kind === kind);
                      return (
                        <div key={kind}>
                          <span>{kind}</span>
                          <strong>
                            {entries.length
                              ? money(
                                  entries.reduce((s, m) => s + mealCost(m), 0),
                                )
                              : "—"}
                          </strong>
                        </div>
                      );
                    })}
                  </div>
                </section>
                <section>
                  <div className="section-heading">
                    <h2>今日の食事</h2>
                    <Button
                      variant="text"
                      className="text-button"
                      onClick={() => navigate("meal")}
                    >
                      ＋ 記録する
                    </Button>
                  </div>
                  {meals.length === 0 ? (
                    <p className="empty">まだ食事の記録がありません。</p>
                  ) : (
                    meals.map((meal) => (
                      <details className="meal-row" key={meal.id}>
                        <summary>
                          <strong>{meal.kind}</strong>
                          <span>
                            {meal.batch
                              ? meal.batch.name
                              : meal.prepared?.length
                                ? "作り置き"
                                : `${meal.usages.length}食材`}
                          </span>
                          <strong className="numeric">
                            {money(mealCost(meal))}
                          </strong>
                        </summary>
                        <div className="meal-detail">
                          {meal.batch && (
                            <div>
                              <span>
                                {meal.batch.name}{" "}
                                {number(meal.batch.eatenServings)}食分
                              </span>
                              <span>{money(mealCost(meal))}</span>
                            </div>
                          )}
                          {(meal.prepared ?? []).map((p) => (
                            <div key={p.batchId}>
                              <span>
                                {
                                  state.meals.find((m) => m.id === p.batchId)
                                    ?.batch?.name
                                }{" "}
                                {number(p.quantity)}食分
                              </span>
                              <span>{money(p.cost)}</span>
                            </div>
                          ))}
                          {!meal.batch &&
                            meal.usages.map((u) => (
                              <div key={u.productId}>
                                <span>
                                  {
                                    state.products.find(
                                      (p) => p.id === u.productId,
                                    )?.name
                                  }{" "}
                                  <small>
                                    {number(u.quantity)}
                                    {u.unit}
                                  </small>
                                </span>
                                <span>
                                  {money(
                                    u.allocations.reduce(
                                      (s, a) => s + a.cost,
                                      0,
                                    ),
                                  )}
                                </span>
                              </div>
                            ))}
                        </div>
                      </details>
                    ))
                  )}
                </section>
                <section>
                  <div className="section-heading">
                    <h2>日別の食費</h2>
                    <span className="hint">使用した分の金額</span>
                  </div>
                  {dailyCosts(state).length ? (
                    dailyCosts(state).map(([date, cost]) => (
                      <div className="history-row" key={date}>
                        <span>
                          {dateLabel(date)}
                          <small>{date.slice(0, 4)}</small>
                        </span>
                        <strong>{money(cost)}</strong>
                      </div>
                    ))
                  ) : (
                    <p className="empty">まだ食費の記録がありません。</p>
                  )}
                </section>
                {state.products.length === 0 && (
                  <div className="sample">
                    <p>記録の流れを試す</p>
                    <Button
                      onClick={() => {
                        try {
                          persist(sampleState(today), "サンプルを追加しました");
                        } catch (e) {
                          setStorageError(
                            e instanceof Error
                              ? e.message
                              : "保存できませんでした",
                          );
                        }
                      }}
                    >
                      サンプルデータを入れる
                    </Button>
                  </div>
                )}
              </>
            )}
            {page === "inventory" && (
              <>
                <TextField
                  className="search"
                  label="在庫を探す"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="食材名・料理名"
                />
                <div className="inventory-groups">
                  {filteredPrepared.length > 0 && (
                    <section aria-labelledby="prepared-heading">
                      <div className="inventory-group-heading">
                        <h2 id="prepared-heading">
                          作り置き{" "}
                          <span className="group-count">
                            {filteredPrepared.length}
                          </span>
                        </h2>
                        <span>残量</span>
                      </div>
                      {preparedRows(filteredPrepared)}
                    </section>
                  )}
                  {filtered.length > 0 && (
                    <section aria-labelledby="ingredients-heading">
                      <div className="inventory-group-heading">
                        <h2 id="ingredients-heading">
                          食材{" "}
                          <span className="group-count">{filtered.length}</span>
                        </h2>
                        <span>残量</span>
                      </div>
                      {inventoryRows(filtered)}
                    </section>
                  )}
                  {filtered.length === 0 && filteredPrepared.length === 0 && (
                    <p className="empty">
                      {search
                        ? "一致する在庫がありません。"
                        : "在庫が登録されていません。"}
                    </p>
                  )}
                </div>
                {(state.adjustments ?? []).length > 0 && (
                  <section>
                    <h2>在庫調整履歴</h2>
                    {[...(state.adjustments ?? [])].reverse().map((a) => {
                      const product = state.products.find(
                        (p) => p.id === a.productId,
                      )!;
                      return (
                        <div className="purchase-row" key={a.id}>
                          <div>
                            <strong>{product.name}</strong>
                            <p className="hint">
                              {dateLabel(a.date)}
                              {a.reason ? ` · ${a.reason}` : ""}
                            </p>
                          </div>
                          <span className="numeric">
                            {number(a.beforeQuantity / 1000)} →{" "}
                            {number(a.targetQuantity / 1000)} {product.baseUnit}
                          </span>
                        </div>
                      );
                    })}
                  </section>
                )}
                <section>
                  <h2>購入履歴</h2>
                  {state.purchases.filter((p) => !p.adjustmentId).length ===
                  0 ? (
                    <p className="empty">まだ購入の記録がありません。</p>
                  ) : (
                    state.purchases
                      .filter((p) => !p.adjustmentId)
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((p) => (
                        <div className="purchase-row" key={p.id}>
                          <div>
                            <strong>
                              {
                                state.products.find((v) => v.id === p.productId)
                                  ?.name
                              }
                            </strong>
                            <p className="hint">
                              {p.date.replaceAll("-", "/")} ·{" "}
                              {number(p.quantity)}
                              {p.unit}
                            </p>
                          </div>
                          <strong>{money(p.price)}</strong>
                        </div>
                      ))
                  )}
                </section>
              </>
            )}
            {page === "purchase" && (
              <PurchaseForm
                state={state}
                today={today}
                onCreateProduct={saveProduct}
                onAddUnit={(product, unit) => {
                  persist(
                    updateProductUnits(state, product.id, [
                      ...product.units,
                      unit,
                    ]),
                    `${product.name}の単位を追加しました`,
                  );
                }}
                onSave={(next) => {
                  persist(next, "購入を記録しました");
                  setPage("inventory");
                }}
              />
            )}
            {page === "meal" && (
              <MealForm
                state={state}
                today={today}
                money={money}
                onSave={(next) => {
                  persist(
                    next,
                    next.meals.at(-1)?.batch?.eatenServings === 0
                      ? "作り置きを保存しました"
                      : "食事を記録しました",
                  );
                  setPage("home");
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
