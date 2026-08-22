"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import catalogJson from "./data/ashiato-spots.json";
import RouteMap from "./components/RouteMap";
import { SAMPLE_PLACES } from "./lib/places";
import { planRoutes } from "./lib/route-engine";
import { buildRouteRequest, parseBudget } from "./lib/route-request";
import { formatMinutes, toRouteViews, type RouteStopView, type RouteView } from "./lib/route-view";

type TripMode = "planned" | "gap";
type CatalogItem = {
  name: string;
  sections: string[];
  genres: string[];
  narafuru: boolean;
  sourcePages: number[];
};

/** ルート生成の状態。読み込み中・候補なし・エラーを画面で区別するために持つ。 */
type ResultState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; routes: RouteView[]; message?: string; travelSource?: TravelSource }
  | { status: "error"; error: string };

/** 徒歩時間の出どころ。osm は実際の徒歩ルート、estimate は直線距離からの概算。 */
type TravelSource = "osm" | "estimate";

const TRAVEL_SOURCE_NOTE: Record<TravelSource, string> = {
  osm: "徒歩時間は OpenStreetMap の徒歩ルートから取得した所要時間です。料金と滞在時間は目安です。",
  estimate: "外部サービスへ接続できなかったため、徒歩時間は直線距離からの概算です。実際はこれより長くかかります。",
};

const catalog = catalogJson as { count: number; items: CatalogItem[] };

const sections = ["すべて", "グルメ・カフェ", "お土産・ショッピング", "文化体験・体験", "宿泊", "サービス"];

function mapsUrl(spot: { name: string; address: string }) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spot.name} ${spot.address}`)}`;
}

function streetViewUrl(spot: { lat: number; lng: number }) {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${spot.lat},${spot.lng}`;
}

export default function Home() {
  const [mode, setMode] = useState<TripMode>("planned");
  const [result, setResult] = useState<ResultState>({ status: "idle" });
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [activeSpot, setActiveSpot] = useState<RouteStopView | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogSection, setCatalogSection] = useState("すべて");
  const [visibleCount, setVisibleCount] = useState(30);
  const [form, setForm] = useState({
    date: "2026-09-12", schedule: "10:00 東大寺を見学\n14:30 近鉄奈良駅で友人と合流", freeStart: "11:30", freeEnd: "14:15",
    duration: "2時間30分", budget: "3000", start: "近鉄奈良駅", returnTo: "近鉄奈良駅", notes: "ならまち、静かな店、甘いもの",
  });

  const filteredCatalog = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    return catalog.items.filter((item) => {
      const sectionMatch = catalogSection === "すべて" || item.sections.includes(catalogSection);
      const queryMatch = !q || [item.name, ...item.sections, ...item.genres].join(" ").toLowerCase().includes(q);
      return sectionMatch && queryMatch;
    });
  }, [catalogQuery, catalogSection]);

  const budget = parseBudget(form.budget);

  // 入力前に見せるイメージも、固定値ではなく同じ計算から作る。
  // サーバー側の初回描画でも動くよう、fetch ではなく直接エンジンを呼ぶ。
  const previewRoutes = useMemo(() => {
    const built = buildRouteRequest({ mode, ...form });
    if (!built.ok) return [];
    return toRouteViews(planRoutes(SAMPLE_PLACES, built.request), built.startClock ? { startClock: built.startClock } : {});
  }, [mode, form]);

  const routes = result.status === "done" ? result.routes : [];
  const activeRoute = routes[selectedRoute] ?? routes[0];

  const catalogSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!activeSpot && !catalogOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (activeSpot) setActiveSpot(null);
      else setCatalogOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeSpot, catalogOpen]);

  useEffect(() => {
    if (catalogOpen) catalogSearchRef.current?.focus();
  }, [catalogOpen]);

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const generate = async (event: FormEvent) => {
    event.preventDefault();
    setSelectedRoute(0);
    setResult({ status: "loading" });
    window.setTimeout(() => document.getElementById("routes")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);

    try {
      const response = await fetch("/api/routes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, ...form }),
      });
      const data = await response.json();
      if (!response.ok) {
        setResult({ status: "error", error: data?.error ?? "ルートを作れませんでした。入力内容をご確認ください。" });
        return;
      }
      setResult({ status: "done", routes: data.routes ?? [], message: data.message, travelSource: data.travelSource });
    } catch {
      setResult({ status: "error", error: "ルートの取得に失敗しました。通信環境を確認して、もう一度お試しください。" });
    }
  };

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="奈良よりみち ホーム">
          <span className="brand-mark" aria-hidden="true">奈</span><span>奈良よりみち</span>
        </a>
        <nav className="header-actions" aria-label="メインナビゲーション">
          <button className="catalog-link" onClick={() => setCatalogOpen(true)}><strong>{catalog.count}</strong>件の掲載スポット</button>
          <span className="data-badge">SHIKA no ASHIATO 公式PDF活用</span>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">NARA ROUTE PLANNER</p>
          <h1>旅のすき間に、<br /><em>奈良のいい時間。</em></h1>
          <p className="lead">決まっている予定を崩さず、予算と空き時間に収まる3つの寄り道ルートをつくります。</p>
          <div className="promise-row" aria-label="サービスの特徴"><span>予算内</span><span>移動時間込み</span><span>出発地へ戻る</span></div>
          <div className="catalog-summary">
            <span className="summary-number">375</span>
            <p><strong>公式掲載スポットを収録</strong><br />飲食・買い物・文化体験・宿泊・サービス</p>
          </div>
        </div>

        <form className="planner-card" onSubmit={generate}>
          <div className="step-label"><span>01</span> 旅の状況を教えてください</div>
          <div className="mode-switch" role="radiogroup" aria-label="旅の状況">
            <button type="button" className={mode === "planned" ? "active" : ""} onClick={() => setMode("planned")} role="radio" aria-checked={mode === "planned"}>
              <strong>予定がある旅行</strong><small>決まった日程の間を提案</small>
            </button>
            <button type="button" className={mode === "gap" ? "active" : ""} onClick={() => setMode("gap")} role="radio" aria-checked={mode === "gap"}>
              <strong>いまの空き時間</strong><small>現在地からすぐ提案</small>
            </button>
          </div>

          <div className="form-grid">
            {mode === "planned" ? (
              <>
                <label className="field"><span>旅行日</span><input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} /></label>
                <label className="field"><span>この寄り道の予算 / 1人</span><div className="input-unit"><input inputMode="numeric" value={form.budget} onChange={(e) => update("budget", e.target.value)} /><b>円</b></div></label>
                <label className="field field-wide"><span>決まっている予定</span><textarea value={form.schedule} onChange={(e) => update("schedule", e.target.value)} /></label>
                <label className="field"><span>空き時間の開始</span><input type="time" value={form.freeStart} onChange={(e) => update("freeStart", e.target.value)} /></label>
                <label className="field"><span>次の予定・帰着時刻</span><input type="time" value={form.freeEnd} onChange={(e) => update("freeEnd", e.target.value)} /></label>
              </>
            ) : (
              <>
                <label className="field"><span>使える時間</span><select value={form.duration} onChange={(e) => update("duration", e.target.value)}><option>1時間</option><option>1時間30分</option><option>2時間</option><option>2時間30分</option><option>3時間</option><option>4時間</option></select></label>
                <label className="field"><span>予算 / 1人</span><div className="input-unit"><input inputMode="numeric" value={form.budget} onChange={(e) => update("budget", e.target.value)} /><b>円</b></div></label>
              </>
            )}

            <label className="field"><span>出発地点</span><div className="location-input"><input value={form.start} onChange={(e) => update("start", e.target.value)} /><button type="button" onClick={() => update("start", "近鉄奈良駅")}>現在地</button></div></label>
            <label className="field"><span>最後に戻る場所</span><input value={form.returnTo} onChange={(e) => update("returnTo", e.target.value)} /></label>
            <label className="field field-wide"><span>備考：行きたい場所・食べたいもの・地域</span><input value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="例：ならまち、静かなカフェ、甘いもの" /></label>
          </div>

          <div className="return-note"><span className="return-icon">↩</span><p><strong>{form.returnTo || "出発地点"}に戻る時間まで計算</strong><br />行きっぱなしにならない往復ルートです</p></div>
          <button className="primary-button" type="submit" disabled={result.status === "loading"}>{result.status === "loading" ? "計算しています…" : <>3つのルートをつくる <span aria-hidden="true">→</span></>}</button>
          <p className="microcopy">公式PDF掲載店・施設を優先。価格と移動時間はプロトタイプ試算です。</p>
        </form>
      </section>

      {result.status === "idle" && (
        <section className="preview-strip" aria-label="提案ルートのイメージ">
          <div className="preview-label"><span className="dot" /><p>提案イメージ（概算）</p><strong>予定に間に合う<br />3つの選択肢</strong><small>ボタンを押すと実際の徒歩時間で計算し直します</small></div>
          {previewRoutes.map((route) => <article className="route-teaser" key={route.id}><span>ROUTE {route.id}</span><h2>{route.title}</h2><p>{route.durationLabel}・{route.totalCost.toLocaleString()}円</p></article>)}
        </section>
      )}

      {result.status !== "idle" && (
        <section className="results" id="routes">
          <div className="results-heading">
            <div><p className="eyebrow">03 ROUTE OPTIONS</p><h2>この時間なら、こんな奈良。</h2></div>
            <div className="conditions"><span>{mode === "planned" ? `${form.freeStart} → ${form.freeEnd}` : form.duration}</span><span>予算 {budget.toLocaleString()}円</span><span>{form.returnTo || form.start}へ帰着</span></div>
          </div>

          {result.status === "loading" && (
            <p className="results-state" role="status">条件に合うルートを計算しています…</p>
          )}

          {result.status === "error" && (
            <p className="results-state error" role="alert">{result.error}</p>
          )}

          {result.status === "done" && routes.length === 0 && (
            <p className="results-state" role="status">{result.message ?? "条件に合うルートが見つかりませんでした。"}</p>
          )}

          {result.status === "done" && activeRoute && (
            <>
              <div className="route-grid">
                {routes.map((route, index) => {
                  const over = budget > 0 && route.totalCost > budget;
                  return (
                    <button key={route.id} className={`route-card ${selectedRoute === index ? "selected" : ""}`} onClick={() => setSelectedRoute(index)} style={{ "--route-color": route.color } as React.CSSProperties}>
                      <div className="route-photo" style={{ backgroundImage: `linear-gradient(180deg, transparent 30%, rgba(20,25,22,.72)), url("${route.image}")` }}><span>ROUTE {route.id}</span><b>{route.durationLabel}</b></div>
                      <div className="route-card-body"><div className="route-card-top"><h3>{route.title}</h3><span className="select-ring">{selectedRoute === index ? "✓" : ""}</span></div><p>{route.description}</p><div className="route-stats"><strong>{route.totalCost.toLocaleString()}円</strong><span>{route.walkLabel}</span></div>{over && <small className="over-budget">予算を{(route.totalCost - budget).toLocaleString()}円超過</small>}</div>
                    </button>
                  );
                })}
              </div>

              <div className="route-detail">
                <RouteMap
                  routeId={activeRoute.id}
                  routeColor={activeRoute.color}
                  walkSummary={activeRoute.walkLabel}
                  stops={activeRoute.stops.map((spot) => ({ spot }))}
                  onSelectSpot={setActiveSpot}
                />

                <div className="itinerary">
                  <div className="itinerary-header"><div><span>選択中・ROUTE {activeRoute.id}</span><h3>{activeRoute.title}</h3></div><strong>{activeRoute.totalCost.toLocaleString()}円</strong></div>
                  <ol>
                    <li className="origin"><time>{mode === "planned" ? form.freeStart : "出発"}</time><div><strong>{form.start}</strong><p>ここから出発</p></div></li>
                    {activeRoute.stops.map((stop) => <li key={stop.id}><time>{stop.arrivalClock ?? `+${stop.arrivalMinutes}分`}</time><button onClick={() => setActiveSpot(stop)}><span className="travel-time">{stop.travelLabel}</span><strong>{stop.name}</strong><p>{stop.type}・{stop.stay}・{stop.price}</p><span className="detail-link">住所・写真・地図を見る →</span></button></li>)}
                    <li className="origin goal"><time>{activeRoute.returnClock ?? formatMinutes(activeRoute.returnMinutes)}</time><div><strong>{form.returnTo || form.start}</strong><p>余裕を約10分残して帰着</p></div></li>
                  </ol>
                  <button className="choose-button">このルートを選ぶ <span>→</span></button>
                  <p className="prototype-note">{TRAVEL_SOURCE_NOTE[result.travelSource ?? "estimate"]}</p>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      <section className="data-section">
        <div><p className="eyebrow">OFFICIAL CATALOG</p><h2>PDFの全カテゴリを、<br />ルート候補に。</h2></div>
        <div className="category-grid">
          {[{n:188,t:"グルメ・カフェ"},{n:127,t:"お土産・ショッピング"},{n:67,t:"文化体験・体験"},{n:34,t:"宿泊"},{n:20,t:"サービス"}].map((item) => <button key={item.t} onClick={() => { setCatalogSection(item.t); setCatalogOpen(true); }}><span>{item.n}</span><strong>{item.t}</strong><small>一覧を見る →</small></button>)}
        </div>
        <p className="data-footnote">※複数カテゴリ掲載があるため、カテゴリ件数の合計は施設総数と一致しません。</p>
      </section>

      <footer><div className="brand"><span className="brand-mark">奈</span><span>奈良よりみち</span></div><p>SHIKA no ASHIATO 掲載スポットを活かしたルート提案プロトタイプ</p><a href="https://www.city.nara.lg.jp/site/shikanoashiato/201908.html" target="_blank" rel="noreferrer">データ出典：奈良市公式ページ ↗</a></footer>

     {activeSpot && (
        <div 
          className="modal-backdrop" 
          role="presentation" 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            zIndex: 99999, 
            backgroundColor: 'rgba(0, 0, 0, 0.6)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <button 
            type="button" 
            className="backdrop-close" 
            aria-label="閉じる" 
            onClick={() => setActiveSpot(null)} 
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: 'transparent' }}
          />
          <section 
            className="spot-modal" 
            role="dialog" 
            aria-modal="true" 
            aria-labelledby="spot-title"
            style={{ 
              position: 'relative', 
              zIndex: 100000, 
              backgroundColor: '#fff', 
              borderRadius: '16px', 
              maxWidth: '520px', 
              width: '100%', 
              maxHeight: '90vh', 
              overflowY: 'auto', 
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)' 
            }}
          >
            <button 
              className="close-button" 
              onClick={() => setActiveSpot(null)} 
              aria-label="閉じる"
              style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 10, cursor: 'pointer', fontSize: '20px', border: 'none', background: 'transparent' }}
            >
              ×
            </button>
            <div className="spot-image" style={{ backgroundImage: `url("${activeSpot.image}")`, height: '220px', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
              <span style={{ position: 'absolute', bottom: '8px', left: '8px', backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '11px' }}>
                SHIKA no ASHIATO 掲載
              </span>
            </div>
            <div className="spot-modal-body" style={{ padding: '20px' }}>
              <p className="spot-type" style={{ fontSize: '12px', color: '#059669', fontWeight: 'bold' }}>{activeSpot.type}</p>
              <h2 id="spot-title" style={{ fontSize: '20px', fontWeight: 'bold', margin: '4px 0 12px' }}>{activeSpot.name}</h2>
              <p className="spot-note" style={{ fontSize: '14px', color: '#4b5563', marginBottom: '16px' }}>{activeSpot.note}</p>
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '13px', background: '#f9fafb', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                <div><dt style={{ color: '#9ca3af', fontSize: '11px' }}>目安料金</dt><dd style={{ fontWeight: 'bold' }}>{activeSpot.price}</dd></div>
                <div><dt style={{ color: '#9ca3af', fontSize: '11px' }}>目安滞在</dt><dd style={{ fontWeight: 'bold' }}>{activeSpot.stay}</dd></div>
                <div style={{ gridColumn: 'span 2' }}><dt style={{ color: '#9ca3af', fontSize: '11px' }}>住所</dt><dd>{activeSpot.address}</dd></div>
              </dl>
              <div className="map-actions" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <a href={mapsUrl(activeSpot)} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: 'center', padding: '10px', backgroundColor: '#18181b', color: '#fff', borderRadius: '8px', fontSize: '13px', textDecoration: 'none' }}>Google マップ</a>
                <a href={streetViewUrl(activeSpot)} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: 'center', padding: '10px', backgroundColor: '#f4f4f5', color: '#18181b', borderRadius: '8px', fontSize: '13px', textDecoration: 'none' }}>Street View</a>
              </div>
              <small style={{ fontSize: '11px', color: '#9ca3af', display: 'block', lineHeight: 1.4 }}>{activeSpot.sourceNote}<br />写真は店舗公式または周辺イメージ。価格・営業時間は変わる場合があります。</small>
            </div>
          </section>
        </div>
      )}

      {catalogOpen && (
        <div className="catalog-backdrop" role="presentation">
          <button type="button" className="backdrop-close" aria-label="閉じる" onClick={() => setCatalogOpen(false)} />
          <aside className="catalog-panel" role="dialog" aria-modal="true" aria-labelledby="catalog-title">
            <header>
              <div><p>SHIKA no ASHIATO 公式PDF</p><h2 id="catalog-title">全{catalog.count}件のスポット</h2></div>
              <button onClick={() => setCatalogOpen(false)} aria-label="閉じる">×</button>
            </header>
            <div className="catalog-tools">
              <label>
                <span>店名・ジャンルを検索</span>
                <input ref={catalogSearchRef} placeholder="カフェ、宿泊、工芸品…" value={catalogQuery} onChange={(e) => { setCatalogQuery(e.target.value); setVisibleCount(30); }} />
              </label>
              <div className="category-chips">
                {sections.map((section) => (
                  <button key={section} className={catalogSection === section ? "active" : ""} onClick={() => { setCatalogSection(section); setVisibleCount(30); }}>{section}</button>
                ))}
              </div>
            </div>
            <div className="catalog-count"><strong>{filteredCatalog.length}</strong>件が該当 <span>● は「ならふる」対応</span></div>
            <div className="catalog-list">
              {filteredCatalog.slice(0, visibleCount).map((item) => (
                <article key={item.name}>
                  <div><h3>{item.name}</h3><p>{item.genres.join(" / ")}</p></div>
                  <div className="catalog-tags">
                    {item.narafuru && <span className="narafuru">● ならふる</span>}
                    {item.sections.slice(0, 2).map((section) => <span key={section}>{section}</span>)}
                  </div>
                </article>
              ))}
            </div>
            {visibleCount < filteredCatalog.length && (
              <button className="load-more" onClick={() => setVisibleCount((count) => count + 30)}>さらに30件表示</button>
            )}
            <footer>
              <a href="https://www.city.nara.lg.jp/uploaded/attachment/204172.pdf" target="_blank" rel="noreferrer">元の公式PDFを開く ↗</a>
              <span>PDF 1〜11ページを構造化</span>
            </footer>
          </aside>
        </div>
      )}
    </main>
  );
}