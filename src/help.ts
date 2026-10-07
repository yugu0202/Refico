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
  "食事",
  "在庫",
  "ホーム",
  "表示",
];
export const helpArticles: HelpArticle[] = [
  {
    id: "getting-started",
    category: "はじめに",
    title: "はじめての記録",
    intro: "食材を買ったら購入を記録し、食べたら使った量を記録します。",
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
        ["この食事の食費", "100円"],
        ["残りの在庫", "2個"],
      ],
    },
    note: "ホームの食費は購入時に支払った金額ではなく、食事で使った分の金額です。作り置きも食べた日に食費として記録されます。",
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
      "食材名と在庫の基準単位（g・ml・個）を入力します。量を量って使う食材はgやml、個数で使う食材は個を選びます。",
      "「食材を保存」を押します。購入の入力に戻ったら、量と価格を入力して記録します。",
    ],
    note: "基準単位は登録後に変更できないため、保存前に確認してください。",
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
      "単位名と、1単位あたりの量を入力します。例えば基準単位がgの白米なら、単位名を「合」、1合あたりの量を「150」にします。",
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
      "「購入」の下にある購入履歴から記録を探します。古い記録は「すべて見る」を押します。",
      "修正したい記録の鉛筆を押します。",
      "内容を修正し、「変更を保存」を押します。",
    ],
    note: "購入記録を修正すると、関連する在庫や食費も変わります。手元の残量だけを合わせたい場合は在庫調整を使います。",
    related: ["adjust-stock", "edit-meal"],
  },
  {
    id: "record-meal",
    category: "食事",
    title: "食事を記録する",
    intro: "食材や作り置きの食べた量を記録します。",
    steps: [
      "「食事」で日付と食事の種類を選びます。",
      "「使ったもの」で食材を選び、使った量と単位を入力します。複数使ったときは「＋ 追加」を押します。",
      "「この食事の金額」を確認し、「食事を記録」を押します。",
    ],
    note: "食材を選べない場合は、先に購入の記録と在庫を確認してください。",
    related: ["record-purchase", "make-prepared", "eat-prepared", "edit-meal"],
  },
  {
    id: "make-prepared",
    category: "食事",
    title: "作り置きを作る",
    intro: "一度に作った料理を、何食分かに分けて残せます。",
    steps: [
      "「食事」で日付と食事の種類を選び、「残りを作り置きにする」にチェックを入れます。",
      "料理名・作った量・今回食べた量を入力します。3食分作って1食分食べた場合は、作った量を3、今回食べた量を1にします。",
      "「使ったもの」に食材と使った量を入力します。",
      "「食事を記録」を押します。すべて保存する場合は今回食べた量を0にし、「作り置きを保存」を押します。残りは「在庫」で確認できます。",
    ],
    image: {
      src: "/help/prepared.svg",
      alt: "残りを作り置きにするにチェックを入れ、料理名・作った量3食分・今回食べた量1食分を入力する操作図",
      caption: "作った全体の量と、今回食べた量を分けて入力します。",
    },
    related: ["eat-prepared", "adjust-stock", "edit-meal"],
  },
  {
    id: "eat-prepared",
    category: "食事",
    title: "作り置きを食べる",
    intro: "保存してある作り置きを、その日の食事に記録します。",
    steps: [
      "「食事」で日付と食事の種類を選びます。",
      "「使ったもの」の作り置きから料理を選び、「食べた量（食分）」を入力します。",
      "金額を確認し、「食事を記録」を押します。",
    ],
    related: ["make-prepared", "view-stock", "edit-meal"],
  },
  {
    id: "edit-meal",
    category: "食事",
    title: "食事履歴を修正する",
    intro: "食事や作り置きの記録に入力間違いがあった場合に修正します。",
    steps: [
      "「食事」の下にある食事履歴から記録を探します。古い記録は「すべて見る」を押します。",
      "修正したい記録の右側にある鉛筆を押します。",
      "日付・使ったもの・量などを修正し、「変更を保存」を押します。",
    ],
    note: "修正すると関連する在庫や食費も変わります。在庫が不足するなど、後の記録と矛盾する変更は保存できません。エラーの案内に沿って入力を確認してください。",
    related: ["adjust-stock", "edit-purchase"],
  },
  {
    id: "view-stock",
    category: "在庫",
    title: "残量を確認する",
    intro: "食材と作り置きの残量をまとめて確認できます。",
    steps: [
      "「在庫」を開きます。",
      "食材や料理の名前で検索します。",
      "右側の数量で残量を確認します。作り置きには「作り置き」の表示が付きます。",
    ],
    related: ["edit-product", "adjust-stock"],
  },
  {
    id: "edit-product",
    category: "在庫",
    title: "名前・単位を変更する",
    intro: "食材名や単位の設定、作り置きの料理名を変更できます。",
    steps: [
      "「在庫」で対象を探し、名前の横の鉛筆を押します。",
      "食材では名前や単位の設定、作り置きでは料理名を変更します。",
      "食材は「変更を保存」、作り置きの料理名は「保存する」を押します。",
    ],
    image: {
      src: "/help/edit-stock.svg",
      alt: "在庫の卵の名前の横に編集の鉛筆、数量の下に別の在庫調整ボタンがある操作図",
      caption: "名前の変更は左側の鉛筆、残量の変更は右側の在庫調整です。",
    },
    related: ["add-unit", "adjust-stock"],
  },
  {
    id: "adjust-stock",
    category: "在庫",
    title: "在庫を調整する",
    intro: "廃棄や記録漏れなどで、実際の残量と合わないときに使います。",
    steps: [
      "「在庫」で対象の「在庫調整」を押します。",
      "「実際の残量」に、今手元にある量を入力します。増減した差分ではなく、調整後の残量を入力してください。",
      "必要に応じて理由を入力し、表示された数量・金額を確認します。",
      "「調整を保存」を押します。",
    ],
    note: "作り置きを減らす調整は廃棄の扱いです。食べた場合は食事として記録してください。増やす調整は作った食数の修正となり、過去の食費も変わります。購入価格や食事の使用量の入力間違いは、在庫調整ではなく履歴から修正します。",
    related: ["edit-purchase", "edit-meal", "eat-prepared"],
  },
  {
    id: "view-cost",
    category: "ホーム",
    title: "日別・月別の食費を確認する",
    intro: "ホームで今日の食費、今月合計、日ごとの食事を確認できます。",
    steps: [
      "「ホーム」で今日の食費と今月合計を確認します。",
      "カレンダーの日付を押し、その日の食事を表示します。食事を開くと内訳を確認できます。",
      "前月・翌月に移動して他の月も確認できます。「今日」で当日に戻ります。",
    ],
    note: "カレンダーの「—」は記録がない日、「¥0」は0円の食事を記録した日です。上部の今月合計は、カレンダーで選んだ月ではなく今月の金額です。",
    related: ["getting-started", "record-meal"],
  },
  {
    id: "change-theme",
    category: "表示",
    title: "テーマを変更する",
    intro: "明るさの好みに合わせて表示を選べます。",
    steps: [
      "右上の人物アイコンからメニューを開きます。",
      "「表示」のテーマから「端末設定」「ライト」「ダーク」を選びます。",
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
