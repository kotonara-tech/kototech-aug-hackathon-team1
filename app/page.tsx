"use client";

import { FormEvent, useMemo, useState } from "react";
import catalogJson from "./data/ashiato-spots.json";

type TripMode = "planned" | "gap";
type CatalogItem = {
  name: string;
  sections: string[];
  genres: string[];
  narafuru: boolean;
  sourcePages: number[];
};
type Spot = {
  name: string;
  type: string;
  address: string;
  price: string;
  cost: number;
  stay: string;
  lat: number;
  lng: number;
  image: string;
  note: string;
  sourceNote: string;
};
type RoutePlan = {
  id: string;
  title: string;
  description: string;
  total: number;
  duration: string;
  walk: string;
  color: string;
  image: string;
  stops: { time: string; travel: string; spot: Spot; x: number; y: number }[];
};

const catalog = catalogJson as { count: number; items: CatalogItem[] };

const spots: Record<string, Spot> = {
  kamado: {
    name: "鹿の舟 竈", type: "和食・カフェ", address: "奈良市井上町11", price: "定食 2,200円〜", cost: 2200, stay: "45分",
    lat: 34.6711, lng: 135.8302, image: "https://www.kuruminoki.co.jp/shikanofune/assets/og.png",
    note: "奈良産のお米を薪の竈で炊く食堂。ご飯がなくなり次第終了。", sourceNote: "料金・営業時間：店舗公式サイト / 掲載属性：奈良市公式PDF",
  },
  nakanishi: {
    name: "寧楽菓子司 中西与三郎", type: "和菓子・文化体験", address: "奈良市脇戸町23", price: "喫茶 約650円〜", cost: 650, stay: "30分",
    lat: 34.6778, lng: 135.8306, image: "https://www.naramachi.jp/wp-content/uploads/2021/08/9766838868a32b3215fcf7c97b40b4f9.png",
    note: "町家の庭を眺めながら奈良の和菓子を。和菓子作り体験もあります。", sourceNote: "住所・営業時間：店舗公式サイト / 掲載属性：奈良市公式PDF",
  },
  tanaka: {
    name: "奈良筆 田中", type: "伝統工芸・文化体験", address: "奈良市公納堂町6", price: "筆づくり 1,600円〜", cost: 1600, stay: "50分",
    lat: 34.6758, lng: 135.8317, image: "https://www.pref.nara.lg.jp/secure/318040/guidebook_2.pdf",
    note: "伝統工芸士と奈良筆の仕上げ工程を体験。予約推奨。", sourceNote: "料金・住所：奈良県公式体験情報 / 掲載属性：奈良市公式PDF",
  },
  kanakana: {
    name: "カナカナ", type: "町家カフェ・和食", address: "奈良市公納堂町13", price: "カナカナごはん 1,683円", cost: 1683, stay: "50分",
    lat: 34.6759, lng: 135.8314, image: "https://kanakana.info/wordpress/wp-content/themes/kanakana/img/kanakana.jpg",
    note: "ならまちの町家カフェ。小鉢が並ぶ名物ごはんは営業時間内いつでも注文可能。", sourceNote: "料金・住所：JR東海観光情報 / 掲載属性：奈良市公式PDF",
  },
  kitokito: {
    name: "器人器人", type: "工芸品・文化体験", address: "奈良市東包永町61-2", price: "見学無料・小物 約1,760円〜", cost: 0, stay: "30分",
    lat: 34.692104, lng: 135.832627, image: "https://www.locoporvino.com/uploads/7/5/0/3/75033277/p1568_orig.png",
    note: "きたまちの古民家で、陶磁器や木工など作家ものの手仕事を探せます。", sourceNote: "住所・座標：NAVITIME / 掲載属性：奈良市公式PDF",
  },
  yusai: {
    name: "奈良酒専門店 なら泉勇斎", type: "日本酒・飲食", address: "奈良市西寺林町22", price: "利き酒 約500円〜", cost: 500, stay: "30分",
    lat: 34.6791, lng: 135.8281, image: "https://www.naraizumi.jp/assets/uploads/ogp.jpg",
    note: "奈良県内の酒蔵から約120種。好みを相談しながら有料試飲ができます。", sourceNote: "住所・営業時間：店舗公式サイト / 掲載属性：奈良市公式PDF",
  },
};

const routes: RoutePlan[] = [
  {
    id: "A", title: "奈良のごはんと町家甘味", description: "ちゃんと食べて、ならまちをゆっくり歩く王道コース。", total: 2850, duration: "2時間24分", walk: "徒歩 31分", color: "#d85d43",
    image: spots.kamado.image,
    stops: [
      { time: "11:43", travel: "近鉄奈良駅から徒歩13分", spot: spots.nakanishi, x: 46, y: 37 },
      { time: "12:28", travel: "徒歩15分", spot: spots.kamado, x: 60, y: 68 },
    ],
  },
  {
    id: "B", title: "職人にふれる奈良筆体験", description: "自分だけの一本をつくって、老舗の甘味でひと休み。", total: 2250, duration: "2時間15分", walk: "徒歩 29分", color: "#315a46",
    image: spots.nakanishi.image,
    stops: [
      { time: "11:48", travel: "近鉄奈良駅から徒歩18分", spot: spots.tanaka, x: 57, y: 62 },
      { time: "12:52", travel: "徒歩4分", spot: spots.nakanishi, x: 48, y: 45 },
    ],
  },
  {
    id: "C", title: "きたまちの器と奈良酒", description: "静かな古民家と地酒をたどる、少し大人の寄り道。", total: 500, duration: "2時間20分", walk: "徒歩 43分", color: "#b68a2e",
    image: spots.yusai.image,
    stops: [
      { time: "11:45", travel: "近鉄奈良駅から徒歩15分", spot: spots.kitokito, x: 63, y: 25 },
      { time: "12:45", travel: "徒歩22分", spot: spots.yusai, x: 42, y: 55 },
    ],
  },
];

const sections = ["すべて", "グルメ・カフェ", "お土産・ショッピング", "文化体験・体験", "宿泊", "サービス"];

function mapsUrl(spot: Spot) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spot.name} ${spot.address}`)}`;
}

function streetViewUrl(spot: Spot) {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${spot.lat},${spot.lng}`;
}

export default function Home() {
  const [mode, setMode] = useState<TripMode>("planned");
  const [generated, setGenerated] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [activeSpot, setActiveSpot] = useState<Spot | null>(null);
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

  const budget = Number(form.budget.replace(/[^0-9]/g, "")) || 0;
  const activeRoute = routes[selectedRoute];

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const generate = (event: FormEvent) => {
    event.preventDefault();
    setGenerated(true);
    setSelectedRoute(0);
    window.setTimeout(() => document.getElementById("routes")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
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
                <label className="field"><span>使える時間</span><select value={form.duration} onChange={(e) => update("duration", e.target.value)}><option>1時間</option><option>1時間30分</option><option>2時間</option><option>2時間30分</option><option>3時間</option><option>半日</option></select></label>
                <label className="field"><span>予算 / 1人</span><div className="input-unit"><input inputMode="numeric" value={form.budget} onChange={(e) => update("budget", e.target.value)} /><b>円</b></div></label>
              </>
            )}

            <label className="field"><span>出発地点</span><div className="location-input"><input value={form.start} onChange={(e) => update("start", e.target.value)} /><button type="button" onClick={() => update("start", "現在地（近鉄奈良駅付近）")}>現在地</button></div></label>
            <label className="field"><span>最後に戻る場所</span><input value={form.returnTo} onChange={(e) => update("returnTo", e.target.value)} /></label>
            <label className="field field-wide"><span>備考：行きたい場所・食べたいもの・地域</span><input value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="例：ならまち、静かなカフェ、甘いもの" /></label>
          </div>

          <div className="return-note"><span className="return-icon">↩</span><p><strong>{form.returnTo || "出発地点"}に戻る時間まで計算</strong><br />行きっぱなしにならない往復ルートです</p></div>
          <button className="primary-button" type="submit">3つのルートをつくる <span aria-hidden="true">→</span></button>
          <p className="microcopy">公式PDF掲載店・施設を優先。価格と移動時間はプロトタイプ試算です。</p>
        </form>
      </section>

      {!generated && (
        <section className="preview-strip" aria-label="提案ルートのイメージ">
          <div className="preview-label"><span className="dot" /><p>提案イメージ</p><strong>予定に間に合う<br />3つの選択肢</strong></div>
          {routes.map((route) => <article className="route-teaser" key={route.id}><span>ROUTE {route.id}</span><h2>{route.title}</h2><p>{route.duration}・{route.total.toLocaleString()}円</p></article>)}
        </section>
      )}

      {generated && (
        <section className="results" id="routes">
          <div className="results-heading">
            <div><p className="eyebrow">03 ROUTE OPTIONS</p><h2>この時間なら、こんな奈良。</h2></div>
            <div className="conditions"><span>{mode === "planned" ? `${form.freeStart} → ${form.freeEnd}` : form.duration}</span><span>予算 {budget.toLocaleString()}円</span><span>{form.returnTo}へ帰着</span></div>
          </div>

          <div className="route-grid">
            {routes.map((route, index) => {
              const over = budget > 0 && route.total > budget;
              return (
                <button key={route.id} className={`route-card ${selectedRoute === index ? "selected" : ""}`} onClick={() => setSelectedRoute(index)} style={{ "--route-color": route.color } as React.CSSProperties}>
                  <div className="route-photo" style={{ backgroundImage: `linear-gradient(180deg, transparent 30%, rgba(20,25,22,.72)), url("${route.image}")` }}><span>ROUTE {route.id}</span><b>{route.duration}</b></div>
                  <div className="route-card-body"><div className="route-card-top"><h3>{route.title}</h3><span className="select-ring">{selectedRoute === index ? "✓" : ""}</span></div><p>{route.description}</p><div className="route-stats"><strong>{route.total.toLocaleString()}円</strong><span>{route.walk}</span></div>{over && <small className="over-budget">予算を{(route.total - budget).toLocaleString()}円超過</small>}</div>
                </button>
              );
            })}
          </div>

          <div className="route-detail">
            <div className="route-map" style={{ "--route-color": activeRoute.color } as React.CSSProperties}>
              <div className="map-grid" aria-hidden="true" />
              <span className="map-label station-label">近鉄奈良駅</span><span className="map-label town-label">ならまち</span><span className="map-label park-label">奈良公園</span>
              <div className="map-path path-one" /><div className="map-path path-two" />
              <span className="map-pin start-pin" aria-label="出発・帰着地点">START<br />& GOAL</span>
              {activeRoute.stops.map((stop, index) => <button key={stop.spot.name} className="map-spot" style={{ left: `${stop.x}%`, top: `${stop.y}%` }} onClick={() => setActiveSpot(stop.spot)} aria-label={`${stop.spot.name}の詳細`}><i>{index + 1}</i><b>{stop.spot.name}</b></button>)}
              <div className="map-legend"><span>徒歩ルート（試算）</span><strong>{activeRoute.walk}</strong></div>
            </div>

            <div className="itinerary">
              <div className="itinerary-header"><div><span>選択中・ROUTE {activeRoute.id}</span><h3>{activeRoute.title}</h3></div><strong>{activeRoute.total.toLocaleString()}円</strong></div>
              <ol>
                <li className="origin"><time>{form.freeStart || "11:30"}</time><div><strong>{form.start}</strong><p>ここから出発</p></div></li>
                {activeRoute.stops.map((stop) => <li key={stop.spot.name}><time>{stop.time}</time><button onClick={() => setActiveSpot(stop.spot)}><span className="travel-time">{stop.travel}</span><strong>{stop.spot.name}</strong><p>{stop.spot.type}・{stop.spot.stay}・{stop.spot.price}</p><span className="detail-link">住所・写真・地図を見る →</span></button></li>)}
                <li className="origin goal"><time>{mode === "planned" ? form.freeEnd : "13:50"}</time><div><strong>{form.returnTo}</strong><p>余裕を約10分残して帰着</p></div></li>
              </ol>
              <button className="choose-button">このルートを選ぶ <span>→</span></button>
              <p className="prototype-note">次段階で、ルート達成確認とSHIKA no ASHIATOクーポン受取を接続予定</p>
            </div>
          </div>
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
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setActiveSpot(null)}>
          <section className="spot-modal" role="dialog" aria-modal="true" aria-labelledby="spot-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={() => setActiveSpot(null)} aria-label="閉じる">×</button>
            <div className="spot-image" style={{ backgroundImage: `url("${activeSpot.image}")` }}><span>SHIKA no ASHIATO 掲載</span></div>
            <div className="spot-modal-body"><p className="spot-type">{activeSpot.type}</p><h2 id="spot-title">{activeSpot.name}</h2><p className="spot-note">{activeSpot.note}</p><dl><div><dt>目安料金</dt><dd>{activeSpot.price}</dd></div><div><dt>目安滞在</dt><dd>{activeSpot.stay}</dd></div><div><dt>住所</dt><dd>{activeSpot.address}</dd></div><div><dt>緯度・経度</dt><dd>{activeSpot.lat.toFixed(6)}, {activeSpot.lng.toFixed(6)}</dd></div></dl><div className="map-actions"><a href={mapsUrl(activeSpot)} target="_blank" rel="noreferrer">Google マップ</a><a href={streetViewUrl(activeSpot)} target="_blank" rel="noreferrer">Street View</a></div><small>{activeSpot.sourceNote}<br />写真は店舗公式または周辺イメージ。価格・営業時間は変わる場合があります。</small></div>
          </section>
        </div>
      )}

      {catalogOpen && (
        <div className="catalog-backdrop" role="presentation" onMouseDown={() => setCatalogOpen(false)}>
          <aside className="catalog-panel" role="dialog" aria-modal="true" aria-labelledby="catalog-title" onMouseDown={(e) => e.stopPropagation()}>
            <header><div><p>SHIKA no ASHIATO 公式PDF</p><h2 id="catalog-title">全{catalog.count}件のスポット</h2></div><button onClick={() => setCatalogOpen(false)} aria-label="閉じる">×</button></header>
            <div className="catalog-tools"><label><span>店名・ジャンルを検索</span><input autoFocus placeholder="カフェ、宿泊、工芸品…" value={catalogQuery} onChange={(e) => { setCatalogQuery(e.target.value); setVisibleCount(30); }} /></label><div className="category-chips">{sections.map((section) => <button key={section} className={catalogSection === section ? "active" : ""} onClick={() => { setCatalogSection(section); setVisibleCount(30); }}>{section}</button>)}</div></div>
            <div className="catalog-count"><strong>{filteredCatalog.length}</strong>件が該当 <span>● は「ならふる」対応</span></div>
            <div className="catalog-list">{filteredCatalog.slice(0, visibleCount).map((item) => <article key={item.name}><div><h3>{item.name}</h3><p>{item.genres.join(" / ")}</p></div><div className="catalog-tags">{item.narafuru && <span className="narafuru">● ならふる</span>}{item.sections.slice(0,2).map((section) => <span key={section}>{section}</span>)}</div></article>)}</div>
            {visibleCount < filteredCatalog.length && <button className="load-more" onClick={() => setVisibleCount((count) => count + 30)}>さらに30件表示</button>}
            <footer><a href="https://www.city.nara.lg.jp/uploaded/attachment/204172.pdf" target="_blank" rel="noreferrer">元の公式PDFを開く ↗</a><span>PDF 1〜11ページを構造化</span></footer>
          </aside>
        </div>
      )}
    </main>
  );
}
