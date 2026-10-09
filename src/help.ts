export interface HelpArticle {
  id: string;
  category: string;
  title: string;
  intro: string;
  steps: string[];
  note?: string;
  example?: { caption: string; rows: [string, string][] };
  image?: { src: string; alt: string; caption: string };
  related: string[];
}

export const helpCategories = [
  "はじめに",
  "購入",
  "料理",
  "食事",
  "在庫",
  "ホーム",
  "表示",
  "スペース",
];
export const helpArticles: HelpArticle[] = [
  {
    id: "share-space",
    category: "スペース",
    title: "スペースを共有する",
    intro: "招待リンクで同じ在庫と食事の記録を共有できます。",
    steps: [
      "右上のメニューから「共有・スペースの設定」を開きます。",
      "オーナーが「招待リンクを作成」を押し、招待リンクをコピーして相手へ送ります。",
      "相手がリンクを開き、Googleでログインしてスペース名を確認し、「参加する」を押します。",
      "右上メニューの「使用するスペース」を開き、スペース名を選ぶと切り替えられます。",
    ],
    note: "招待リンクは7日間有効で、1人が参加すると使用済みになります。参加前の記録は元のスペースに残ります。オーナーはメンバーを外したり、招待リンクを無効にしたりできます。メンバーは設定から退出できます。",
    related: ["getting-started"],
  },
  {
    id: "getting-started",
    category: "はじめに",
    title: "はじめての記録",
    intro:
      "買った食材と食事で使った量を記録すると、残量と食費を確認できます。外食やお弁当も記録できます。",
    steps: [
      "「購入」で食材・購入量・購入価格・購入日を入力し、「購入を記録」を押します。初めての食材は選択欄の「＋ 食材を追加」から登録します。",
      "「食事」で日付と食事の種類を選び、「使ったもの」に食材と使った量を入力します。金額を確認して「食事を記録」を押します。",
      "「在庫」で残量、「ホーム」でその日の食費を確認します。",
    ],
    example: {
      caption: "卵を3個300円で購入し、1個使った場合",
      rows: [
        ["購入の記録", "3個・300円"],
        ["食事に使った量", "1個"],
        ["合計", "100円"],
        ["残りの在庫", "2個"],
      ],
    },
    note: "ホームの食費は購入時に支払った金額ではなく、食事で使った分の金額です。料理も食べた日に食費として記録されます。",
    related: ["record-purchase", "record-meal", "view-cost"],
  },
  {
    id: "record-purchase",
    category: "購入",
    title: "購入を記録する",
    intro: "買った食材の量と税込の支払額を記録します。",
    steps: [
      "「購入」を開き、食材を選びます。",
      "購入量と単位、購入価格、購入日を入力します。",
      "「購入を記録」を押します。下の購入履歴と「在庫」で記録を確認できます。",
    ],
    related: ["add-product", "add-unit", "edit-purchase"],
  },
  {
    id: "add-product",
    category: "購入",
    title: "食材を追加する",
    intro: "初めて買う食材は、購入の入力中に登録できます。",
    steps: [
      "「購入」の食材選択欄を開き、「＋ 食材を追加」を押します。",
      "食材名と在庫の単位（g・ml・個）を入力します。量を量って使う食材はgやml、個数で使う食材は個を選びます。",
      "「食材を保存」を押します。購入の入力に戻ったら、量と価格を入力して記録します。",
    ],
    note: "在庫の単位は登録後に変更できないため、保存前に確認してください。",
    image: {
      src: "/help/add-product.svg",
      alt: "購入の食材選択欄を開くと、食材一覧の下に「＋ 食材を追加」がある操作図",
      caption: "食材の選択欄から追加します。",
    },
    related: ["record-purchase", "add-unit", "edit-product"],
  },
  {
    id: "add-unit",
    category: "購入",
    title: "合・袋・パックなどの単位を追加する",
    intro: "食材ごとに、普段使う単位を登録できます。",
    steps: [
      "「購入」で食材を選び、購入量の単位選択欄から「＋ 単位を追加」を押します。",
      "単位名と、1単位あたりの量を入力します。例えば在庫の単位がgの白米なら、単位名を「合」、1合あたりの量を「150」にします。",
      "「単位を追加」を押し、購入量を入力して記録します。",
    ],
    related: ["record-purchase", "edit-product"],
  },
  {
    id: "edit-purchase",
    category: "購入",
    title: "購入履歴を修正する",
    intro: "購入量・価格・日付などの入力間違いを修正できます。",
    steps: [
      "「購入」の下にある購入履歴から記録を探します。6件以上ある場合は「すべて見る」で全件履歴を開き、名前・日付で探せます。閉じると入力画面に戻ります。",
      "修正したい記録の鉛筆を押します。",
      "内容を修正し、「変更を保存」を押します。",
    ],
    note: "購入記録を修正すると、関連する在庫や食費も変わります。手元の残量だけを合わせたい場合は、在庫の鉛筆から残量を修正します。",
    related: ["adjust-stock", "edit-meal"],
  },
  {
    id: "record-meal",
    category: "食事",
    title: "食事を記録する",
    intro: "自炊や外食など、その日の食事を記録します。",
    steps: [
      "「食事」で日付と食事の種類を選びます。",
      "在庫を使うときは「＋ 食材・料理を追加」を押し、食材や料理と使った量を入力します。複数使ったときは「＋ もう1品追加」を押します。",
      "外食・弁当・惣菜・テイクアウトなどは「＋ 金額を入力」を押し、金額を入力します。内容と店名・購入先は任意です。食材や料理と一緒に記録できます。",
      "金額と入力内容を確認し、「食事を記録」を押します。",
    ],
    note: "食材を選べない場合は、先に購入の記録と在庫を確認してください。",
    related: ["record-purchase", "make-prepared", "eat-prepared", "edit-meal"],
  },
  {
    id: "make-prepared",
    category: "料理",
    title: "料理を作る",
    intro: "作った料理を何食分かに分けて登録し、食べた分を食事に記録できます。",
    steps: [
      "「料理」を開きます。",
      "料理名・作った日・作った量を入力します。カレーを4食分作った場合は、作った量を4にします。",
      "「使った食材」に食材と使った量を入力し、「料理を保存」を押します。",
      "食べるときは「食事」の「＋ 食材・料理を追加」から料理を選び、食べた量を入力します。",
    ],
    note: "料理と食事は、タブを切り替えても入力が残ります。",
    image: {
      src: "/help/prepared.svg",
      alt: "料理タブで、料理名・作った日・作った量4食分・使った食材を入力する操作図",
      caption: "作った全体を保存し、食べた分は食事で記録します。",
    },
    related: ["eat-prepared", "adjust-stock", "edit-meal", "edit-cooking"],
  },
  {
    id: "edit-cooking",
    category: "料理",
    title: "料理履歴を確認・修正する",
    intro: "食べ切った料理も、料理履歴から確認・修正できます。",
    steps: [
      "「料理」でフォーム下の「料理履歴」を見ます。6件以上ある場合は「すべて見る」で全件履歴を開き、名前・日付で探せます。閉じると入力画面に戻ります。",
      "料理の行を開くと、残量と使った食材を確認できます。",
      "鉛筆を押し、料理名・作った日・作った量・使った食材を修正して「変更を保存」を押します。",
    ],
    note: "修正すると関連する食費も変わります。後の記録と矛盾する変更は保存できません。",
    related: ["make-prepared", "eat-prepared", "adjust-stock"],
  },
  {
    id: "eat-prepared",
    category: "食事",
    title: "料理を食べる",
    intro: "保存してある料理を、その日の食事に記録します。",
    steps: [
      "「食事」で日付と食事の種類を選びます。",
      "「＋ 食材・料理を追加」を押し、料理を選んで「食べた量（食分）」を入力します。",
      "金額を確認し、「食事を記録」を押します。",
    ],
    related: ["make-prepared", "view-stock", "edit-meal", "edit-cooking"],
  },
  {
    id: "edit-meal",
    category: "食事",
    title: "食事履歴を修正する",
    intro: "食事の記録に入力間違いがあった場合に修正します。",
    steps: [
      "「食事」の下にある食事履歴から記録を探します。6件以上ある場合は「すべて見る」で全件履歴を開き、内容・日付で探せます。閉じると入力画面に戻ります。",
      "修正したい記録の右側にある鉛筆を押します。",
      "日付・使ったもの・量・外食などの金額・内容・店名・購入先を修正し、「変更を保存」を押します。",
    ],
    note: "修正すると関連する在庫や食費も変わります。在庫が不足するなど、後の記録と矛盾する変更は保存できません。エラーの案内に沿って入力を確認してください。",
    related: ["adjust-stock", "edit-purchase"],
  },
  {
    id: "view-stock",
    category: "在庫",
    title: "残量を確認する",
    intro: "食材と料理の残量をまとめて確認できます。",
    steps: [
      "「在庫」を開きます。",
      "食材や料理の名前で検索します。",
      "右側の数量で残量を確認します。料理には「料理」の表示が付きます。",
    ],
    related: ["edit-product", "adjust-stock"],
  },
  {
    id: "edit-product",
    category: "在庫",
    title: "在庫を編集する",
    intro: "名前・残量・よく使う単位を、鉛筆から変更できます。",
    steps: [
      "「在庫」で対象を探し、行の右端の鉛筆を押します。",
      "食材では名前・現在の残量・よく使う単位を変更します。料理では名前・作った日・作った量・現在の残量・使った食材を変更します。",
      "残量のない料理は「料理」の料理履歴から鉛筆を押して修正します。",
      "「変更を保存」を押します。",
    ],
    image: {
      src: "/help/edit-stock.svg",
      alt: "在庫の卵の行の右端に鉛筆があり、名前・残量・単位をまとめて編集する操作図",
      caption: "名前と残量は、行の右端の鉛筆から変更できます。",
    },
    related: ["add-unit", "adjust-stock"],
  },
  {
    id: "adjust-stock",
    category: "在庫",
    title: "残量を修正する",
    intro: "廃棄や記録漏れなどで、実際の残量と合わないときに使います。",
    steps: [
      "「在庫」で対象の行の右端の鉛筆を押します。",
      "「現在の残量」に、今手元にある量を入力します。g・kgやml・Lは単位欄で切り替えられます。",
      "表示された変更前後の量を確認し、必要に応じて理由を入力します。",
      "「変更を保存」を押します。",
    ],
    note: "料理を減らす調整は廃棄の扱いです。食べた場合は食事として記録してください。増やす調整は作った量の修正となり、過去の食費も変わります。購入価格や食事の使用量の入力間違いは、履歴から修正します。",
    related: ["edit-purchase", "edit-meal", "eat-prepared"],
  },
  {
    id: "view-cost",
    category: "ホーム",
    title: "日別・月別の食費を確認する",
    intro: "ホームで今日の食費、今月の食費、日ごとの食事を確認できます。",
    steps: [
      "「ホーム」で今日の食費と今月の食費を確認します。",
      "カレンダーの日付を押し、その日の食事を表示します。食事を開くと内訳を確認できます。",
      "前月・翌月に移動して他の月も確認できます。「今日」で当日に戻ります。",
    ],
    note: "自炊と外食などの金額を合計します。カレンダーの「—」は記録がない日、「¥0」は0円の食事を記録した日です。上部の今月の食費は、カレンダーで選んだ月ではなく今月の金額です。",
    related: ["getting-started", "record-meal"],
  },
  {
    id: "change-theme",
    category: "表示",
    title: "テーマを変更する",
    intro: "明るさの好みに合わせて表示を選べます。",
    steps: [
      "右上の人物アイコンからメニューを開きます。",
      "「表示」の「テーマ」を開き、「端末設定」「ライト」「ダーク」を選びます。",
      "閉じるボタンでメニューを閉じます。",
    ],
    note: "端末設定を選ぶと、端末のライト・ダーク設定に合わせて切り替わります。",
    related: [],
  },
];

export type HelpPageId = "help" | `help/${string}`;
export function helpPageFromPath(path: string): HelpPageId | null {
  const normalized = path.replace(/\/+$/, "");
  return normalized === "/help" || normalized.startsWith("/help/")
    ? (normalized.slice(1) as HelpPageId)
    : null;
}
export function findHelpArticle(page: HelpPageId) {
  return helpArticles.find((article) => `help/${article.id}` === page);
}

export function helpBackAction(
  page: HelpPageId,
  state: { reficoHelpDepth?: number; reficoHelpReturn?: boolean } | null,
): { type: "go"; delta: number } | { type: "replace"; page: "help" | "home" } {
  // The button follows the hierarchy, independently of related-article history.
  if (page !== "help") {
    const depth = state?.reficoHelpDepth;
    if (Number.isInteger(depth) && depth! > 0)
      return { type: "go", delta: -depth! };
    return { type: "replace", page: "help" };
  }
  return state?.reficoHelpReturn
    ? { type: "go", delta: -1 }
    : { type: "replace", page: "home" };
}
