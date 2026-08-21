/**
 * ルート計算に使える施設データ。
 *
 * 公式PDF（app/data/ashiato-spots.json）の375件には、住所・座標・料金・滞在時間が
 * 入っていない。ルートを組み立てるにはそれらが要るため、ここでは項目が揃っている
 * ものだけを手作業で補ってある。名前は必ず公式カタログの表記に合わせること。
 *
 * 料金と滞在時間は目安であり、リアルタイムの値ではない。出典は sourceNote に残す。
 */

import type { EnginePlace } from "./route-engine.ts";

/** エンジンが使う項目に、画面表示用の項目を足したもの。 */
export type SamplePlace = EnginePlace & {
  address: string;
  /** 画面に出す料金の書き方。例「定食 2,200円〜」 */
  price: string;
  /** 画面に出す滞在時間の書き方。例「45分」 */
  stay: string;
  image: string;
  note: string;
  /** どこから取った情報かの記載。画面の詳細に必ず出す。 */
  sourceNote: string;
};

export const SAMPLE_PLACES: SamplePlace[] = [
  {
    id: "kamado",
    name: "鹿の舟 竈",
    type: "和食・カフェ",
    address: "奈良市井上町11",
    price: "定食 2,200円〜",
    cost: 2200,
    stay: "45分",
    stayMinutes: 45,
    lat: 34.6711,
    lng: 135.8302,
    genres: ["和食", "カフェ", "ならまち"],
    shikaMember: true,
    image: "https://www.kuruminoki.co.jp/shikanofune/assets/og.png",
    note: "奈良産のお米を薪の竈で炊く食堂。ご飯がなくなり次第終了。",
    sourceNote: "料金・営業時間：店舗公式サイト / 掲載属性：奈良市公式PDF",
  },
  {
    id: "nakanishi",
    name: "寧楽菓子司 中西与三郎",
    type: "和菓子・文化体験",
    address: "奈良市脇戸町23",
    price: "喫茶 約650円〜",
    cost: 650,
    stay: "30分",
    stayMinutes: 30,
    lat: 34.6778,
    lng: 135.8306,
    genres: ["和菓子", "甘いもの", "文化体験", "ならまち"],
    shikaMember: true,
    image: "https://www.naramachi.jp/wp-content/uploads/2021/08/9766838868a32b3215fcf7c97b40b4f9.png",
    note: "町家の庭を眺めながら奈良の和菓子を。和菓子作り体験もあります。",
    sourceNote: "住所・営業時間：店舗公式サイト / 掲載属性：奈良市公式PDF",
  },
  {
    id: "tanaka",
    name: "奈良筆 田中",
    type: "伝統工芸・文化体験",
    address: "奈良市公納堂町6",
    price: "筆づくり 1,600円〜",
    cost: 1600,
    stay: "50分",
    stayMinutes: 50,
    lat: 34.6758,
    lng: 135.8317,
    genres: ["伝統工芸", "体験", "文化体験", "ならまち"],
    shikaMember: true,
    image: "https://www.pref.nara.lg.jp/secure/318040/guidebook_2.pdf",
    note: "伝統工芸士と奈良筆の仕上げ工程を体験。予約推奨。",
    sourceNote: "料金・住所：奈良県公式体験情報 / 掲載属性：奈良市公式PDF",
  },
  {
    id: "kanakana",
    name: "カナカナ",
    type: "町家カフェ・和食",
    address: "奈良市公納堂町13",
    price: "カナカナごはん 1,683円",
    cost: 1683,
    stay: "50分",
    stayMinutes: 50,
    lat: 34.6759,
    lng: 135.8314,
    genres: ["カフェ", "和食", "ならまち"],
    shikaMember: true,
    image: "https://kanakana.info/wordpress/wp-content/themes/kanakana/img/kanakana.jpg",
    note: "ならまちの町家カフェ。小鉢が並ぶ名物ごはんは営業時間内いつでも注文可能。",
    sourceNote: "料金・住所：JR東海観光情報 / 掲載属性：奈良市公式PDF",
  },
  {
    id: "kitokito",
    name: "器人器人",
    type: "工芸品・文化体験",
    address: "奈良市東包永町61-2",
    price: "見学無料・小物 約1,760円〜",
    cost: 0,
    stay: "30分",
    stayMinutes: 30,
    lat: 34.692104,
    lng: 135.832627,
    genres: ["工芸品", "お土産", "きたまち"],
    shikaMember: true,
    image: "https://www.locoporvino.com/uploads/7/5/0/3/75033277/p1568_orig.png",
    note: "きたまちの古民家で、陶磁器や木工など作家ものの手仕事を探せます。",
    sourceNote: "住所・座標：NAVITIME / 掲載属性：奈良市公式PDF",
  },
  {
    id: "yusai",
    name: "奈良酒専門店 なら泉勇斎",
    type: "日本酒・飲食",
    address: "奈良市西寺林町22",
    price: "利き酒 約500円〜",
    cost: 500,
    stay: "30分",
    stayMinutes: 30,
    lat: 34.6791,
    lng: 135.8281,
    genres: ["日本酒", "お土産", "ならまち"],
    shikaMember: true,
    image: "https://www.naraizumi.jp/assets/uploads/ogp.jpg",
    note: "奈良県内の酒蔵から約120種。好みを相談しながら有料試飲ができます。",
    sourceNote: "住所・営業時間：店舗公式サイト / 掲載属性：奈良市公式PDF",
  },
];
