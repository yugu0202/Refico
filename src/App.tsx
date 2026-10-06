import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useEffect, useState } from "react";
import {
  dailyCosts,
  emptyState,
  mealCost,
  stock,
  updateProductUnits,
  type State,
  type Product,
} from "./domain/inventory";
import { loadState, saveState } from "./domain/storage";
import { sampleState } from "./domain/sample";
import { ProductForm } from "./components/ProductForm";
import { PurchaseForm } from "./components/PurchaseForm";
import { MealForm } from "./components/MealForm";
import { InventoryRow } from "./components/InventoryRow";
import { money, number, localDate, dateLabel } from "./format";
const navigation = [
  { id: "home", label: "今日" },
  { id: "inventory", label: "在庫" },
  { id: "purchase", label: "購入を記録" },
  { id: "meal", label: "食事を記録" },
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
  const [search, setSearch] = useState("");
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
  const meals = state.meals.filter((m) => m.date === today);
  const total = meals.reduce((sum, m) => sum + mealCost(m), 0);
  const filtered = state.products.filter((p) => p.name.includes(search));
  const title = navigation.find((n) => n.id === page)!.label;
  const inventoryRows = (products: Product[]) =>
    products.map((product) => (
      <InventoryRow
        key={product.id}
        product={product}
        state={state}
        showUnits={page === "inventory"}
        onEditUnits={
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
          Refico<span>在庫と食費</span>
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
            {n.label}
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
            {editingProduct && (
              <ProductForm
                key={editingProduct.id}
                product={editingProduct}
                onSave={saveProduct}
                onSaveUnits={(units) => {
                  persist(
                    updateProductUnits(state, editingProduct.id, units),
                    `${editingProduct.name}の単位を更新しました`,
                  );
                  setEditingProduct(null);
                }}
                onCancel={() => setEditingProduct(null)}
              />
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
                    <p className="empty">
                      まだ食事の記録がありません。使った食材から食費を計算できます。
                    </p>
                  ) : (
                    meals.map((meal) => (
                      <details className="meal-row" key={meal.id}>
                        <summary>
                          <strong>{meal.kind}</strong>
                          <span>{meal.usages.length}食材</span>
                          <strong className="numeric">
                            {money(mealCost(meal))}
                          </strong>
                        </summary>
                        <div className="meal-detail">
                          {meal.usages.map((u) => (
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
                                  u.allocations.reduce((s, a) => s + a.cost, 0),
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
                    <h2>在庫</h2>
                    <Button
                      variant="text"
                      className="text-button"
                      onClick={() => navigate("inventory")}
                    >
                      すべて見る →
                    </Button>
                  </div>
                  {state.products.some(
                    (p) => stock(state, p.id).quantity > 0,
                  ) ? (
                    inventoryRows(
                      state.products
                        .filter((p) => stock(state, p.id).quantity > 0)
                        .slice(0, 5),
                    )
                  ) : (
                    <p className="empty">
                      購入を記録すると、ここに食材の残量が表示されます。
                    </p>
                  )}
                  <div className="actions">
                    <Button onClick={() => navigate("purchase")}>
                      ＋ 購入を記録
                    </Button>
                  </div>
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
                    <p className="empty">
                      食事を記録すると、日ごとの合計が表示されます。
                    </p>
                  )}
                </section>
                {state.products.length === 0 && (
                  <div className="sample">
                    <p>記録の流れを試す</p>
                    <Button
                      onClick={() => {
                        try {
                          persist(
                            sampleState(today),
                            "サンプルを追加しました。白米・卵・鶏もも肉が登録されています",
                          );
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
                    <span className="hint">空の状態でのみ追加できます。</span>
                  </div>
                )}
              </>
            )}
            {page === "inventory" && (
              <>
                <TextField
                  className="search"
                  label="食材を探す"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="食材名"
                />
                <div className="list-caption">
                  <span>{filtered.length}食材</span>
                  <span>残量 / 在庫金額</span>
                </div>
                {inventoryRows(filtered)}
                {filtered.length === 0 && (
                  <p className="empty">
                    {state.products.length
                      ? "一致する食材がありません。"
                      : "購入を記録すると、ここに食材が表示されます。"}
                  </p>
                )}
                <section>
                  <h2>購入履歴</h2>
                  {state.purchases.length === 0 ? (
                    <p className="empty">まだ購入の記録がありません。</p>
                  ) : (
                    [...state.purchases]
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
                  persist(next, "食事を記録しました");
                  setPage("home");
                }}
              />
            )}
          </>
        )}
      </main>
      <footer>ひな形 · データはこのブラウザに保存されます</footer>
    </div>
  );
}
