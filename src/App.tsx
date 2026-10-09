import { EnvironmentLabel } from "./components/EnvironmentLabel";
import {
  SpaceSettings,
  Invitation,
  type SpaceDetails,
} from "./components/SpaceSettings";
import { sharingRequest, type Space } from "./api";
import { AccountMenu } from "./components/AccountMenu";
import { BrandLogo } from "./components/BrandLogo";
import { HelpPage } from "./components/HelpPage";
import { helpPageFromPath, helpBackAction, type HelpPageId } from "./help";
import type { Command } from "./domain/commands";
import { ApiError, bootstrap, sendCommand, authClient } from "./api";
import { createFocusRefresh } from "./refresh";
import { History } from "./components/History";
import { DirectMealDetail } from "./components/DirectMealDetail";
import { MealDetailRow } from "./components/MealDetailRow";
import { LoginScreen } from "./components/LoginScreen";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import { PreparedForm } from "./components/PreparedForm";
import DialogTitle from "@mui/material/DialogTitle";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import SvgIcon from "@mui/material/SvgIcon";
import TextField from "@mui/material/TextField";
import { Toast } from "./components/Toast";
import { useEffect, useState, useRef } from "react";
import {
  dailyCosts,
  emptyState,
  mealCost,
  preparedRemaining,
  type Cooking,
  type State,
  type Product,
} from "./domain/inventory";
import { ProductForm } from "./components/ProductForm";
import { PurchaseForm } from "./components/PurchaseForm";
import { MealForm } from "./components/MealForm";
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
    id: "cooking",
    label: "料理を作る",
    shortLabel: "料理",
    icon: "M6 10h12v8a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-8ZM4 10h16M8 7h8M12 4v3M3 13h3M18 13h3",
  },
  {
    id: "meal",
    label: "食事を記録",
    shortLabel: "食事",
    icon: "M5 3v5a3 3 0 0 0 6 0V3M8 3v18M19 3c-3 2-4 5-4 9h4M19 3v18",
  },
] as const;
type Page = (typeof navigation)[number]["id"] | HelpPageId;
function currentPage(): Page {
  const help = helpPageFromPath(window.location.pathname);
  if (help) return help;
  const saved = window.history.state?.reficoPage;
  return navigation.some((item) => item.id === saved) ? saved : "home";
}
export default function App() {
  const mainRef = useRef<HTMLElement>(null);
  const [page, setPage] = useState<Page>(currentPage);
  const helpPage = helpPageFromPath(`/${page}`);
  const [reopenMenu, setReopenMenu] = useState(() =>
    Boolean(window.history.state?.reficoMenuOpen),
  );
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [spaceId, setSpaceId] = useState("");
  const [spaceSettings, setSpaceSettings] = useState<SpaceDetails | null>(null);
  const [invitation, setInvitation] = useState(
    () =>
      window.location.pathname.match(/^\/invitations\/([a-f0-9]{64})$/)?.[1] ??
      null,
  );
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
  const loadsInFlight = useRef(0);
  const [focusRefresh] = useState(() =>
    createFocusRefresh(
      () => reload(),
      () => busyRef.current || loadsInFlight.current > 0,
    ),
  );
  async function reload(force = false, propagate = false) {
    if (busyRef.current && !force) return;
    focusRefresh.markFresh();
    ++loadsInFlight.current;
    const generation = ++loadGeneration.current;
    setAuthChecking(true);
    try {
      const data = await bootstrap(force);
      if (generation === loadGeneration.current) setAuthMode(data.authMode);
      if (generation !== loadGeneration.current) return;
      setSpaces(data.spaces);
      setSpaceId(data.spaceId);
      setSampleDataEnabled(data.sampleDataEnabled === true);
      if (identityRef.current && identityRef.current !== data.spaceId) {
        setSpaceSettings(null);
        setFormVersion((v) => v + 1);
        setEditingProduct(null);
        setEditingPrepared(null);
        setSearch("");
        setNotice("");
      }
      if (
        identityRef.current !== data.spaceId ||
        data.revision >= revisionRef.current
      ) {
        identityRef.current = data.spaceId;
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
      if (propagate) throw e;
    } finally {
      --loadsInFlight.current;
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
        callbackURL: invitation ? `/invitations/${invitation}` : "/",
        errorCallbackURL: invitation
          ? `/invitations/${invitation}?login=failed`
          : "/?login=failed",
      });
      if (response.error) throw new Error(response.error.message);
    } catch {
      setLoginError("ログインできませんでした。もう一度お試しください。");
      signingInRef.current = false;
      setSigningIn(false);
    }
  }
  async function logout() {
    if (busyRef.current)
      throw new Error("保存中です。完了してから操作してください");
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
    setNotice("");
    setEditingPrepared(null);
    navigate("home");
  }
  const [storageError, setStorageError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeVersion, setNoticeVersion] = useState(0);
  const [editingPrepared, setEditingPrepared] = useState<Cooking | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const selectedDate = selectedDay ?? today;
  const [formVersion, setFormVersion] = useState(0);
  const [mealVersion, setMealVersion] = useState(0);
  const [cookingVersion, setCookingVersion] = useState(0);
  const [search, setSearch] = useState("");
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
    if (page === "meal" || page === "cooking") {
      mainRef.current
        ?.querySelector<HTMLHeadingElement>("h1")
        ?.focus({ preventScroll: true });
    }
    if (helpPage) {
      document
        .querySelector<HTMLElement>(".help-page h1")
        ?.focus({ preventScroll: true });
      document
        .querySelector<HTMLElement>(".help-page")
        ?.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [page]);
  useEffect(() => {
    const restore = () => selectPage(currentPage());
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("login") === "failed") {
      url.searchParams.delete("login");
      window.history.replaceState(window.history.state, "", url);
    }
    void reload();
    const refresh = () => {
      setToday(localDate());
      void focusRefresh.refresh();
    };
    window.addEventListener("focus", refresh);
    return () => {
      ++loadGeneration.current;
      window.removeEventListener("focus", refresh);
    };
  }, []);
  function notify(message: string) {
    setNotice(message);
    if (message) setNoticeVersion((v) => v + 1);
  }
  async function persist(command: Command, message: string) {
    if (busyRef.current)
      throw new Error("保存中です。完了してから操作してください");
    busyRef.current = true;
    setBusy(true);
    setNotice("");
    ++loadGeneration.current;
    try {
      const next = await sendCommand(
        command,
        revisionRef.current,
        identityRef.current,
      );
      focusRefresh.markFresh();
      revisionRef.current = next.revision;
      setState(next.state);
      notify(message);
      setStorageError("");
      return next.state;
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
    const historyState = { ...window.history.state, reficoPage: next };
    if (helpPageFromPath(`/${next}`)) {
      if (busyRef.current || next === page) return;
      if (helpPage && next === "help") {
        leaveHelp();
        return;
      }
      const currentDepth =
        window.history.state?.reficoHelpDepth ??
        (helpPage === "help" ? 0 : undefined);
      window.history.replaceState(
        {
          ...window.history.state,
          reficoPage: page,
          ...(helpPage
            ? { reficoHelpDepth: currentDepth }
            : { reficoMenuOpen: true }),
        },
        "",
      );
      window.history.pushState(
        {
          ...historyState,
          reficoMenuOpen: false,
          reficoHelpReturn: helpPage
            ? Boolean(window.history.state?.reficoHelpReturn)
            : true,
          reficoHelpDepth: helpPage
            ? currentDepth === undefined
              ? undefined
              : currentDepth + 1
            : 0,
        },
        "",
        `/${next}`,
      );
    } else {
      delete historyState.reficoHelpReturn;
      delete historyState.reficoHelpDepth;
      historyState.reficoMenuOpen = false;
      // Tabs still share the root URL; retain the tab when returning from help.
      window.history.replaceState(
        historyState,
        "",
        helpPage ? "/" : window.location.href,
      );
    }
    selectPage(next);
  }
  function selectPage(next: Page) {
    setPage(next);
    setReopenMenu(Boolean(window.history.state?.reficoMenuOpen));
    setEditingPrepared(null);
    setEditingProduct(null);
    setNotice("");
  }
  function leaveHelp() {
    if (!helpPage) return;
    const action = helpBackAction(helpPage, window.history.state);
    if (action.type === "go") window.history.go(action.delta);
    else {
      window.history.replaceState(
        {
          ...window.history.state,
          reficoPage: action.page,
          reficoHelpReturn: false,
          reficoHelpDepth: action.page === "help" ? 0 : undefined,
          reficoMenuOpen: false,
        },
        "",
        action.page === "help" ? "/help" : "/",
      );
      selectPage(action.page);
    }
  }
  function menuClosed() {
    setReopenMenu(false);
    window.history.replaceState(
      { ...window.history.state, reficoMenuOpen: false },
      "",
    );
  }
  async function saveProduct(product: Product) {
    await persist(
      { type: "product.create", product },
      `${product.name}を追加しました`,
    );
  }
  const meals = state.meals.filter((m) => m.date === selectedDate);
  const costs = new Map(dailyCosts(state));
  const total = costs.get(today) ?? 0;
  const monthTotal = [...costs].reduce(
    (sum, [date, cost]) =>
      date.startsWith(today.slice(0, 7)) ? sum + cost : sum,
    0,
  );
  const filtered = state.products.filter((p) => p.name.includes(search));
  const prepared = state.cookings.filter(
    (c) => preparedRemaining(state, c) > 0,
  );
  const filteredPrepared = prepared.filter((m) => m.name.includes(search));
  const preparedRows = (items: typeof prepared) =>
    items.map((m) => {
      const remaining = preparedRemaining(state, m);
      return (
        <div className="inventory-row" key={m.id}>
          <div>
            <strong>{m.name}</strong>
            <p className="hint">
              <span className="inventory-kind">料理</span> · 作った日{" "}
              {dateLabel(m.date)}
            </p>
          </div>
          <div className="inventory-actions">
            <div className="numeric">
              <strong>{number(remaining)}食分</strong>
            </div>
            <IconButton
              type="button"
              disabled={busy}
              aria-label={`${m.name}を編集`}
              title="料理を編集"
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
          </div>
        </div>
      );
    });
  const title = navigation.find((n) => n.id === page)?.label;
  const inventoryRows = (products: Product[]) =>
    products.map((product) => (
      <InventoryRow
        key={product.id}
        product={product}
        state={state}
        showValue={false}
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
  // The guide is readable from a direct URL, even without a signed-in session.
  if (helpPage)
    return (
      <HelpPage page={helpPage} onBack={leaveHelp} onNavigate={navigate} />
    );
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
      {spaceSettings && spaces.find((s) => s.id === spaceId) && (
        <SpaceSettings
          key={`space-settings:${spaceId}`}
          space={spaces.find((s) => s.id === spaceId)!}
          initialDetails={spaceSettings}
          onClose={() => setSpaceSettings(null)}
          onChanged={() => reload(true, true)}
          onNotify={notify}
        />
      )}
      {invitation && (
        <Invitation
          token={invitation}
          onCancel={() => {
            setInvitation(null);
            window.history.replaceState(null, "", "/");
          }}
          onAccepted={async () => {
            await reload(true, true);
            setInvitation(null);
            window.history.replaceState(null, "", "/");
            notify("スペースに参加しました");
          }}
        />
      )}
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
          <span className="brand-name">
            Refico
            <EnvironmentLabel />
          </span>
        </a>
        <AccountMenu
          spaces={spaces}
          spaceId={spaceId}
          onSwitch={async (id) => {
            if (id === spaceId) return;
            if (busyRef.current) throw new Error("保存中です");
            busyRef.current = true;
            setBusy(true);
            ++loadGeneration.current;
            try {
              await sharingRequest("/api/spaces", {
                type: "switch",
                spaceId: id,
              });
              await reload(true, true);
            } finally {
              busyRef.current = false;
              setBusy(false);
            }
          }}
          onPrepareSettings={async () => {
            const details = await sharingRequest<SpaceDetails>(
              "/api/spaces/details",
              undefined,
              spaceId,
            );
            if (identityRef.current !== spaceId)
              throw new Error(
                "スペースが変更されました。もう一度お試しください。",
              );
            return details;
          }}
          onSettings={setSpaceSettings}
          user={user}
          canLogout={authMode === "google"}
          busy={busy}
          onLogout={logout}
          onHelp={() => navigate("help")}
          reopen={reopenMenu}
          onClosed={menuClosed}
        />
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
      <main ref={mainRef} key={spaceId}>
        <div className="page-heading">
          <h1 tabIndex={-1}>{title}</h1>
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
        {ready && (
          <>
            {editingPrepared && (
              <Dialog
                open
                onClose={() => {
                  if (!busyRef.current) {
                    setEditingPrepared(null);
                  }
                }}
                fullWidth
                maxWidth="sm"
                aria-labelledby="prepared-form-title"
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
                <DialogTitle id="prepared-form-title">料理を編集</DialogTitle>
                <DialogContent sx={{ "&&": { paddingTop: 1.5 } }}>
                  <PreparedForm
                    onPurchase={() => navigate("purchase")}
                    state={state}
                    today={today}
                    editing={editingPrepared}
                    showCost={false}
                    onCancel={() => {
                      setEditingPrepared(null);
                    }}
                    onSave={async (command) => {
                      await persist(command, "料理を更新しました");
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
                    state={state}
                    today={today}
                    onSave={saveProduct}
                    onSaveChanges={async (name, units, adjustment) => {
                      await persist(
                        {
                          type: "product.update",
                          id: editingProduct.id,
                          name,
                          units,
                          adjustment,
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
                    <p className="eyebrow">今月の食費</p>
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
                    <p className="empty">
                      この日の食事はまだ記録されていません。
                    </p>
                  ) : (
                    meals.map((meal) => (
                      <details
                        className="meal-row"
                        key={`${selectedDate}-${meal.id}`}
                      >
                        <summary>
                          <strong>{meal.kind}</strong>
                          <span>
                            {meal.direct &&
                            !meal.usages.length &&
                            !meal.prepared?.length
                              ? "金額入力"
                              : `${meal.usages.length + (meal.prepared?.length ?? 0) + (meal.direct ? 1 : 0)}品`}
                          </span>
                          <strong className="numeric">
                            {money(mealCost(meal))}
                          </strong>
                        </summary>
                        <div className="meal-detail">
                          {meal.direct && (
                            <DirectMealDetail direct={meal.direct} />
                          )}
                          {(meal.prepared ?? []).map((p) => (
                            <MealDetailRow key={p.batchId} amount={p.cost}>
                              {
                                state.cookings.find((c) => c.id === p.batchId)
                                  ?.name
                              }{" "}
                              {number(p.quantity)}食分
                            </MealDetailRow>
                          ))}
                          {meal.usages.map((u) => (
                            <MealDetailRow
                              key={u.productId}
                              amount={u.allocations.reduce(
                                (s, a) => s + a.cost,
                                0,
                              )}
                            >
                              {
                                state.products.find((p) => p.id === u.productId)
                                  ?.name
                              }{" "}
                              <small>
                                {number(u.quantity)}
                                {u.unit}
                              </small>
                            </MealDetailRow>
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
                    <h2>料理の残量修正履歴</h2>
                    {[...(state.preparedAdjustments ?? [])]
                      .reverse()
                      .map((a) => (
                        <div className="purchase-row" key={a.id}>
                          <div>
                            <strong>
                              {
                                state.cookings.find((c) => c.id === a.batchId)
                                  ?.name
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
                    <h2>食材の残量修正履歴</h2>
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
                  onSave={async (command, message) => {
                    await persist(command, message);
                  }}
                  saving={busy}
                />
              </>
            )}
            <div hidden={page !== "cooking"}>
              <PreparedForm
                onPurchase={() => navigate("purchase")}
                key={cookingVersion}
                state={state}
                today={today}
                autoFocus={false}
                showCost={false}
                onSave={async (command) => {
                  await persist(command, "料理を保存しました");
                  setCookingVersion((v) => v + 1);
                }}
              />
              <History
                type="cooking"
                state={state}
                today={today}
                onSave={async (command, message) => {
                  await persist(command, message);
                }}
                saving={busy}
              />
            </div>
            <div hidden={page !== "meal"}>
              <MealForm
                onPurchase={() => navigate("purchase")}
                key={mealVersion}
                state={state}
                today={today}
                money={money}
                onSave={async (command) => {
                  await persist(command, "食事を記録しました");
                  setMealVersion((v) => v + 1);
                }}
              />
              <History
                type="meal"
                state={state}
                today={today}
                onSave={async (command, message) => {
                  await persist(command, message);
                }}
                saving={busy}
              />
            </div>
          </>
        )}
      </main>
      <Toast
        open={!!notice}
        message={notice}
        version={noticeVersion}
        onClose={() => setNotice("")}
      />
    </div>
  );
}
