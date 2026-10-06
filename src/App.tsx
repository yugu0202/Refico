import { ThemeControl } from "./components/ThemeControl";
import { BrandLogo } from "./components/BrandLogo";
import type { Command } from "./domain/commands";
import { ApiError, bootstrap, sendCommand, authClient } from "./api";
import { History } from "./components/History";
import { LoginScreen } from "./components/LoginScreen";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import { PreparedNameForm } from "./components/PreparedNameForm";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import SvgIcon from "@mui/material/SvgIcon";
import TextField from "@mui/material/TextField";
import { useEffect, useState, useRef } from "react";
import {
  dailyCosts,
  emptyState,
  mealCost,
  preparedRemaining,
  type Meal,
  type State,
  type Product,
} from "./domain/inventory";
import { ProductForm } from "./components/ProductForm";
import { PurchaseForm } from "./components/PurchaseForm";
import { MealForm } from "./components/MealForm";
import { StockAdjustmentForm } from "./components/StockAdjustmentForm";
import { CostCalendar } from "./components/CostCalendar";
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
  const mainRef = useRef<HTMLElement>(null);
  const [page, setPage] = useState<Page>("home");
  const [today, setToday] = useState(localDate);
  const [state, setState] = useState<State>(emptyState);
  const [ready, setReady] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const signingInRef = useRef(false);
  const [loginError, setLoginError] = useState(() =>
    new URLSearchParams(window.location.search).get("login") === "failed"
      ? "ログインできませんでした。もう一度お試しください。"
      : "",
  );
  const [authMode, setAuthMode] = useState<"google" | "test" | null>(null);
  const [sampleDataEnabled, setSampleDataEnabled] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const revisionRef = useRef(0);
  const identityRef = useRef("");
  const loadGeneration = useRef(0);
  async function reload(force = false) {
    if (busyRef.current && !force) return;
    const generation = ++loadGeneration.current;
    setAuthChecking(true);
    try {
      const data = await bootstrap();
      if (generation === loadGeneration.current) setAuthMode(data.authMode);
      if (generation !== loadGeneration.current) return;
      setSampleDataEnabled(data.sampleDataEnabled === true);
      if (
        identityRef.current !== data.householdId ||
        data.revision >= revisionRef.current
      ) {
        identityRef.current = data.householdId;
        revisionRef.current = data.revision;
        setState(data.state);
        setUser(data.user);
        setReady(true);
        setLoginError("");
        setStorageError("");
      }
    } catch (e) {
      if (generation !== loadGeneration.current) return;
      setSampleDataEnabled(false);
      if (e instanceof ApiError && e.authMode) setAuthMode(e.authMode);
      if (e instanceof ApiError && e.status === 401) {
        identityRef.current = "";
        revisionRef.current = 0;
        setUser(null);
        setState(emptyState());
        setReady(false);
        setStorageError("");
      } else
        setStorageError(
          e instanceof Error ? e.message : "読み込めませんでした",
        );
    } finally {
      if (generation === loadGeneration.current) setAuthChecking(false);
    }
  }
  async function login() {
    if (signingInRef.current || authChecking || authMode !== "google") return;
    signingInRef.current = true;
    setSigningIn(true);
    setLoginError("");
    try {
      const response = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
        errorCallbackURL: "/?login=failed",
      });
      if (response.error) throw new Error(response.error.message);
    } catch {
      setLoginError("ログインできませんでした。もう一度お試しください。");
      signingInRef.current = false;
      setSigningIn(false);
    }
  }
  async function logout() {
    if (busyRef.current) return;
    try {
      const response = await authClient.signOut();
      if (response.error) throw new Error(response.error.message);
      ++loadGeneration.current;
      identityRef.current = "";
      revisionRef.current = 0;
      setUser(null);
      setReady(false);
      setAuthChecking(false);
      setLoginError("");
      setStorageError("");
      setState(emptyState());
      navigate("home");
    } catch (e) {
      setStorageError(
        e instanceof Error ? e.message : "ログアウトできませんでした",
      );
    }
  }
  const [storageError, setStorageError] = useState("");
  const [notice, setNotice] = useState("");
  const [adjustingPrepared, setAdjustingPrepared] = useState<Meal | null>(null);
  const [editingPrepared, setEditingPrepared] = useState<Meal | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(
    null,
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const selectedDate = selectedDay ?? today;
  const [formVersion, setFormVersion] = useState(0);
  const [search, setSearch] = useState("");
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [page]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("login") === "failed") {
      url.searchParams.delete("login");
      window.history.replaceState(window.history.state, "", url);
    }
    void reload();
    const refresh = () => {
      setToday(localDate());
      if (!busyRef.current) void reload();
    };
    window.addEventListener("focus", refresh);
    return () => {
      ++loadGeneration.current;
      window.removeEventListener("focus", refresh);
    };
  }, []);
  async function persist(command: Command, message: string) {
    if (busyRef.current)
      throw new Error("保存中です。完了してから操作してください");
    busyRef.current = true;
    setBusy(true);
    ++loadGeneration.current;
    try {
      const next = await sendCommand(command, revisionRef.current);
      revisionRef.current = next.revision;
      setState(next.state);
      setNotice(message);
      setStorageError("");
    } catch (e) {
      if (e instanceof ApiError && (e.status === 409 || e.status === 401))
        await reload(true);
      throw e;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function navigate(next: Page) {
    setPage(next);
    setAdjustingPrepared(null);
    setEditingPrepared(null);
    setEditingProduct(null);
    setAdjustingProduct(null);
    setNotice("");
  }
  async function saveProduct(product: Product) {
    await persist(
      { type: "product.create", product },
      `${product.name}を追加しました`,
    );
  }
  const meals = state.meals.filter(
    (m) => m.date === selectedDate && (!m.batch || m.batch.eatenServings > 0),
  );
  const costs = new Map(dailyCosts(state));
  const total = costs.get(today) ?? 0;
  const monthTotal = [...costs].reduce(
    (sum, [date, cost]) =>
      date.startsWith(today.slice(0, 7)) ? sum + cost : sum,
    0,
  );
  const filtered = state.products.filter((p) => p.name.includes(search));
  const prepared = state.meals.filter((m) => m.batch);
  const filteredPrepared = prepared.filter((m) =>
    m.batch!.name.includes(search),
  );
  const preparedRows = (items: typeof prepared) =>
    items.map((m) => {
      const remaining = preparedRemaining(state, m);
      return (
        <div className="inventory-row" key={m.id}>
          <div>
            <Stack direction="row" sx={{ alignItems: "center" }}>
              <strong>{m.batch!.name}</strong>
              <IconButton
                type="button"
                disabled={busy}
                aria-label={`${m.batch!.name}を編集`}
                title="作り置きを編集"
                onClick={() => {
                  setEditingPrepared(m);
                  setNotice("");
                }}
                sx={{ width: 44, height: 44, flexShrink: 0 }}
              >
                <SvgIcon fontSize="small">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                </SvgIcon>
              </IconButton>
            </Stack>
            <p className="hint">
              <span className="inventory-kind">作り置き</span> · 作った日{" "}
              {dateLabel(m.date)}
            </p>
          </div>
          <div className="numeric">
            <strong>{number(remaining)}食分</strong>
            <Button
              type="button"
              variant="text"
              disabled={busy}
              aria-label={`${m.batch!.name}の在庫を調整`}
              onClick={() => {
                setAdjustingPrepared(m);
                setNotice("");
              }}
              sx={{ display: "block", marginLeft: "auto", minWidth: 0 }}
            >
              在庫調整
            </Button>
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
  if (!ready)
    return (
      <LoginScreen
        loading={authChecking}
        signingIn={signingIn}
        canLogin={authMode === "google" && !authChecking && !storageError}
        error={storageError || loginError}
        onLogin={() => void login()}
        onRetry={storageError ? () => void reload() : undefined}
      />
    );
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
          <BrandLogo size={28} />
          Refico
        </a>
        <Stack
          className="header-account"
          direction="row"
          sx={{ alignItems: "center", gap: 1 }}
        >
          <ThemeControl />
          {user ? (
            <>
              <span className="hint">{user.name}</span>
              {authMode === "google" && (
                <Button disabled={busy} onClick={() => void logout()}>
                  ログアウト
                </Button>
              )}
            </>
          ) : null}
        </Stack>
      </header>
      <nav className="navigation" aria-label="メインメニュー">
        {navigation.map((n) => (
          <Button
            type="button"
            disabled={busy}
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
      <main ref={mainRef}>
        <div className="page-heading">
          <h1>{title}</h1>
        </div>
        {storageError && (
          <p className="error" role="alert">
            {storageError}
          </p>
        )}
        {busy && (
          <p className="hint" role="status">
            保存中…
          </p>
        )}
        {ready && storageError && (
          <Button onClick={() => void reload()}>再読み込み</Button>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {ready && (
          <>
            {adjustingPrepared && (
              <StockAdjustmentForm
                key={adjustingPrepared.id}
                state={state}
                prepared={adjustingPrepared}
                today={today}
                onCancel={() => setAdjustingPrepared(null)}
                onSave={async (next) => {
                  await persist(next, "在庫を調整しました");
                  setAdjustingPrepared(null);
                }}
              />
            )}
            {adjustingProduct && (
              <StockAdjustmentForm
                key={adjustingProduct.id}
                state={state}
                product={adjustingProduct}
                today={today}
                onCancel={() => setAdjustingProduct(null)}
                onSave={async (next) => {
                  await persist(next, "在庫を調整しました");
                  setAdjustingProduct(null);
                }}
              />
            )}
            {editingPrepared && (
              <Dialog
                open
                onClose={() => {
                  if (!busyRef.current) setEditingPrepared(null);
                }}
                fullWidth
                maxWidth="sm"
                aria-labelledby="prepared-title"
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
                  <PreparedNameForm
                    key={editingPrepared.id}
                    name={editingPrepared.batch!.name}
                    onCancel={() => setEditingPrepared(null)}
                    onSave={async (name) => {
                      await persist(
                        {
                          type: "prepared.rename",
                          id: editingPrepared.id,
                          name,
                        },
                        `${name.trim()}を更新しました`,
                      );
                      setEditingPrepared(null);
                    }}
                  />
                </DialogContent>
              </Dialog>
            )}
            {editingProduct && (
              <Dialog
                open
                onClose={() => {
                  if (!busyRef.current) setEditingProduct(null);
                }}
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
                    onSaveChanges={async (name, units) => {
                      await persist(
                        {
                          type: "product.update",
                          id: editingProduct.id,
                          name,
                          units,
                        },
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
                  <div>
                    <p id="daily-title" className="eyebrow">
                      今日の食費
                    </p>
                    <p className="daily-total">{money(total)}</p>
                  </div>
                  <div className="month-total">
                    <p className="eyebrow">今月合計</p>
                    <p>{money(monthTotal)}</p>
                  </div>
                </section>
                <CostCalendar
                  today={today}
                  selectedDate={selectedDate}
                  costs={costs}
                  onSelect={setSelectedDay}
                />
                <section aria-labelledby="selected-meals-title">
                  <div className="section-heading">
                    <h2 id="selected-meals-title">
                      {dateLabel(selectedDate)}の食事
                    </h2>
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
                      <details
                        className="meal-row"
                        key={`${selectedDate}-${meal.id}`}
                      >
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
                {sampleDataEnabled && state.products.length === 0 && (
                  <div className="sample">
                    <p>記録の流れを試す</p>
                    <Button
                      onClick={async () => {
                        try {
                          await persist(
                            { type: "sample.create", date: today },
                            "サンプルを追加しました",
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
                <section
                  className="inventory-list"
                  aria-labelledby="inventory-list-heading"
                >
                  <div className="inventory-group-heading">
                    <h2 id="inventory-list-heading">
                      在庫{" "}
                      <span className="group-count">
                        {filtered.length + filteredPrepared.length}
                      </span>
                    </h2>
                    <span>残量</span>
                  </div>
                  {preparedRows(filteredPrepared)}
                  {inventoryRows(filtered)}
                  {filtered.length === 0 && filteredPrepared.length === 0 && (
                    <p className="empty">
                      {search
                        ? "一致する在庫がありません。"
                        : "在庫が登録されていません。"}
                    </p>
                  )}
                </section>
                {(state.preparedAdjustments ?? []).length > 0 && (
                  <section>
                    <h2>作り置きの在庫調整履歴</h2>
                    {[...(state.preparedAdjustments ?? [])]
                      .reverse()
                      .map((a) => (
                        <div className="purchase-row" key={a.id}>
                          <div>
                            <strong>
                              {
                                state.meals.find((m) => m.id === a.batchId)
                                  ?.batch?.name
                              }
                            </strong>
                            <p className="hint">
                              {dateLabel(a.date)}
                              {a.reason ? ` · ${a.reason}` : ""}
                            </p>
                          </div>
                          <span className="numeric">
                            {number(a.beforeQuantity / 1000)} →{" "}
                            {number(a.targetQuantity / 1000)} 食分
                          </span>
                        </div>
                      ))}
                  </section>
                )}
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
              </>
            )}
            {page === "purchase" && (
              <>
                <PurchaseForm
                  key={formVersion}
                  state={state}
                  today={today}
                  onCreateProduct={saveProduct}
                  onAddUnit={async (product, unit) => {
                    await persist(
                      {
                        type: "product.update",
                        id: product.id,
                        name: product.name,
                        units: [...product.units, unit],
                      },
                      `${product.name}の単位を追加しました`,
                    );
                  }}
                  onSave={async (command) => {
                    await persist(command, "購入を記録しました");
                    setFormVersion((v) => v + 1);
                  }}
                />
                <History
                  type="purchase"
                  state={state}
                  today={today}
                  onSave={persist}
                  saving={busy}
                />
              </>
            )}
            {page === "meal" && (
              <>
                <MealForm
                  key={formVersion}
                  state={state}
                  today={today}
                  money={money}
                  onSave={async (command) => {
                    await persist(command, "食事を記録しました");
                    setFormVersion((v) => v + 1);
                  }}
                />
                <History
                  type="meal"
                  state={state}
                  today={today}
                  onSave={persist}
                  saving={busy}
                />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
