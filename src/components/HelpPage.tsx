import Button from "@mui/material/Button";
import { BrandLogo } from "./BrandLogo";

const topics = [
  {
    id: "purchase",
    title: "食材を購入する",
    steps: [
      "「購入」を開き、食材を選びます。初めての食材は「＋ 食材を追加」から名前と基準単位を登録します。",
      "購入量・単位・税込の購入価格・購入日を入力します。合やパックなどの単位は、単位の選択欄から追加できます。",
      "「購入を記録」を押します。登録した食材は「在庫」で確認できます。",
    ],
  },
  {
    id: "meal",
    title: "食事を記録する",
    steps: [
      "「食事」を開き、食事の日付と種類を選びます。",
      "「使ったもの」で食材を選び、使った量と単位を入力します。複数の食材を使ったときは行を追加します。",
      "表示された金額を確認し、「食事を記録」を押します。",
    ],
  },
  {
    id: "prepared",
    title: "作り置きを記録する",
    steps: [
      "「食事」で「残りを作り置きにする」を選び、料理名・作った量・今回食べた量を入力します。すべて保存する場合は今回食べた量を0にします。",
      "使った食材と量を入力し、「作り置きを保存」を押します。残った作り置きは「在庫」に表示されます。",
      "後日食べるときは「食事」の「使ったもの」から作り置きを選び、食べた量を入力して記録します。",
    ],
  },
  {
    id: "inventory",
    title: "在庫を確認・調整する",
    steps: [
      "「在庫」で食材と作り置きの残量を確認します。名前で検索できます。",
      "名前の横の鉛筆から食材名・単位や作り置きの料理名を変更できます。",
      "実際の残量と合わないときは「在庫調整」を押し、実際の残量と任意の理由を入力して「調整を保存」を押します。",
    ],
    note: "作り置きを減らす調整は廃棄の扱いです。増やす調整は作った食数の修正となり、過去の食費も変わるので、保存前に食数と金額を確認してください。",
  },
  {
    id: "history",
    title: "購入・食事の履歴を編集する",
    steps: [
      "「購入」または「食事」の下にある履歴を確認します。古い記録は「すべて見る」から探せます。",
      "修正したい記録の鉛筆を押し、内容を変更して「変更を保存」を押します。",
    ],
    note: "記録の入力間違いは履歴から修正します。手元の残量だけを合わせたいときは「在庫調整」を使います。",
  },
  {
    id: "cost",
    title: "食費を見る",
    steps: [
      "「ホーム」で今日の食費と今月合計を確認します。",
      "カレンダーの日付を選ぶと、その日の食事が表示されます。食事を開くと内訳を確認できます。",
      "前月・翌月へ移動して過去の記録を確認できます。「今日」で当日に戻ります。",
    ],
  },
  {
    id: "display",
    title: "テーマを変更する",
    steps: [
      "右上の人物アイコンを押し、「表示」のテーマから「端末設定」「ライト」「ダーク」を選びます。",
    ],
  },
  {
    id: "sharing",
    title: "家族との共有について",
    note: "家族の招待・共有はまだ利用できません。",
  },
] as const;

export function HelpPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          href="/"
          className="brand"
          onClick={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            onBack();
          }}
        >
          <BrandLogo size={28} />
          Refico
        </a>
        <Button onClick={onBack} sx={{ minHeight: 44 }}>
          戻る
        </Button>
      </header>
      <main className="help-page">
        <div className="page-heading">
          <h1 tabIndex={-1}>使い方</h1>
        </div>
        <section aria-labelledby="help-basics">
          <h2 id="help-basics">基本の使い方</h2>
          <p>
            食材を買ったら「購入」、食べたら「食事」に記録します。「在庫」で残量、「ホーム」で食費を確認できます。
          </p>
          <nav className="help-topics" aria-label="使い方の目次">
            {topics.map((topic) => (
              <a
                key={topic.id}
                href={`#help-${topic.id}`}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  document.getElementById(`help-${topic.id}`)?.scrollIntoView();
                  document
                    .getElementById(`help-${topic.id}`)
                    ?.focus({ preventScroll: true });
                  // Section links must not add entries between help and the originating tab.
                  window.history.replaceState(
                    window.history.state,
                    "",
                    `#help-${topic.id}`,
                  );
                }}
              >
                {topic.title}
              </a>
            ))}
          </nav>
        </section>
        {topics.map((topic) => (
          <section key={topic.id} aria-labelledby={`help-${topic.id}`}>
            <h2 id={`help-${topic.id}`} tabIndex={-1}>
              {topic.title}
            </h2>
            {"steps" in topic && (
              <ol>
                {topic.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
            {"note" in topic && <p>{topic.note}</p>}
          </section>
        ))}
      </main>
    </div>
  );
}
