import { EnvironmentLabel } from "./EnvironmentLabel";
import { useEffect, useRef, type MouseEvent } from "react";
import Button from "@mui/material/Button";
import { BrandLogo } from "./BrandLogo";
import {
  helpArticles,
  helpCategories,
  findHelpArticle,
  type HelpPageId,
} from "../help";

export function HelpPage({
  page,
  onBack,
  onNavigate,
  embedded = false,
}: {
  page: HelpPageId;
  onBack: () => void;
  onNavigate: (page: HelpPageId) => void;
  embedded?: boolean;
}) {
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const main = mainRef.current;
    const scroll = embedded ? main?.parentElement : main;
    scroll?.scrollTo({ top: 0, behavior: "instant" });
    const heading =
      main?.querySelector<HTMLElement>("h1") ??
      main
        ?.closest("[role=dialog]")
        ?.querySelector<HTMLElement>("#help-screen-title");
    heading?.focus({ preventScroll: true });
  }, [page, embedded]);
  const article = findHelpArticle(page);
  const link = (event: MouseEvent<HTMLAnchorElement>, next: HelpPageId) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    onNavigate(next);
  };
  const content = (
    <>
      {!embedded && (
        <header className="app-header">
          <a href="/" className="brand">
            <BrandLogo size={28} />
            <span className="brand-name">
              Refico
              <EnvironmentLabel />
            </span>
          </a>
          <Button variant="text" onClick={onBack} sx={{ minHeight: 44 }}>
            戻る
          </Button>
        </header>
      )}
      <main className="help-page" ref={mainRef}>
        {page !== "help" && (
          <nav className="help-breadcrumb" aria-label="使い方の階層">
            <a href="/help" onClick={(event) => link(event, "help")}>
              使い方
            </a>
            {article && (
              <>
                <span aria-hidden="true">›</span>
                <span>{article.category}</span>
              </>
            )}
          </nav>
        )}
        {(!embedded || page !== "help") && (
          <div className="page-heading">
            <h1 tabIndex={-1}>
              {page === "help"
                ? "使い方"
                : (article?.title ?? "説明が見つかりません")}
            </h1>
          </div>
        )}
        {page === "help" ? (
          <nav aria-label="使い方の一覧">
            {helpCategories.map((category, index) => (
              <section
                key={category}
                aria-labelledby={`help-category-${index}`}
              >
                <h2 id={`help-category-${index}`}>{category}</h2>
                <ul className="help-links">
                  {helpArticles
                    .filter((item) => item.category === category)
                    .map((item) => (
                      <li key={item.id}>
                        <a
                          href={`/help/${item.id}`}
                          onClick={(event) => link(event, `help/${item.id}`)}
                        >
                          {item.title}
                          <span aria-hidden="true">›</span>
                        </a>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </nav>
        ) : article ? (
          <article>
            <p>{article.intro}</p>
            {article.image && (
              <figure className="help-figure">
                <img
                  src={article.image.src}
                  alt={article.image.alt}
                  width="520"
                  height="260"
                />
                <figcaption>{article.image.caption}</figcaption>
              </figure>
            )}
            <section aria-labelledby="help-steps">
              <h2 id="help-steps">操作手順</h2>
              <ol>
                {article.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
            {article.example && (
              <section aria-labelledby="help-example">
                <h2 id="help-example">記録の例</h2>
                <table className="help-example">
                  <caption>{article.example.caption}</caption>
                  <tbody>
                    {article.example.rows.map(([label, value]) => (
                      <tr key={label}>
                        <th scope="row">{label}</th>
                        <td>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
            {article.note && (
              <section aria-labelledby="help-note">
                <h2 id="help-note">確認しておきたいこと</h2>
                <p>{article.note}</p>
              </section>
            )}
            {article.related.length > 0 && (
              <section aria-labelledby="help-related">
                <h2 id="help-related">関連する使い方</h2>
                <ul className="help-links">
                  {article.related.map((id) => {
                    const related = helpArticles.find(
                      (item) => item.id === id,
                    )!;
                    return (
                      <li key={id}>
                        <a
                          href={`/help/${id}`}
                          onClick={(event) => link(event, `help/${id}`)}
                        >
                          {related.title}
                          <span aria-hidden="true">›</span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </article>
        ) : (
          <p>使い方の一覧から、確認したい項目を選んでください。</p>
        )}
      </main>
    </>
  );
  return embedded ? content : <div className="app-shell">{content}</div>;
}
