import { normalizeLocale } from './i18n.js?v=1.4.2';

export const statsMessages = {
  en: {
    title: 'A little garden of bounces', aboutTitle: 'Bouncing together', players: 'Players · estimated', runs: 'Games played', distribution: 'Where we land', scores: 'Score ranges', games: 'Games', details: 'See the numbers', loading: 'Gathering our little garden…', unavailable: 'The garden is resting. Your game is ready.', empty: 'A fresh little garden. Every game helps it grow.', updated: 'Updated {time}', stale: 'Last available totals · {time}', caption: 'Completed games that passed verification. Each range groups scores; the ranges have different widths.', estimate: 'Players are anonymous browsers, not accounts. Another device or cleared browser data can count again.', sharing: 'Share anonymous game stats', privacy: 'An anonymous browser ID and finished-game scores help build these totals. Stored scores are grouped into ranges. No account needed.',
  },
  'zh-Hans': {
    title: '一起跳出小小花园', aboutTitle: '一起快乐弹跳', players: '游玩人数 · 估算', runs: '游戏次数', distribution: '我们的落点', scores: '分数区间', games: '游戏次数', details: '查看详细数据', loading: '正在汇集花园里的小故事…', unavailable: '花园数据暂歇，游戏随时可玩。', empty: '崭新的小花园，每局游戏都让它成长。', updated: '更新于 {time}', stale: '上次可用数据 · {time}', caption: '已通过验证的完整游戏。按分数区间分组，各区间跨度不同。', estimate: '人数按匿名浏览器估算，不是账户数。更换设备或清除浏览器数据可能重复计数。', sharing: '分享匿名游戏统计', privacy: '匿名浏览器标识和每局结束时的成绩用于汇总统计。成绩仅按区间分组存储，无需账户。',
  },
  'zh-Hant': {
    title: '一起跳出小小花園', aboutTitle: '一起快樂彈跳', players: '遊玩人數 · 估算', runs: '遊戲次數', distribution: '我們的落點', scores: '分數區間', games: '遊戲次數', details: '查看詳細資料', loading: '正在匯集花園裡的小故事…', unavailable: '花園資料暫歇，遊戲隨時可玩。', empty: '嶄新的小花園，每局遊戲都讓它成長。', updated: '更新於 {time}', stale: '上次可用資料 · {time}', caption: '已通過驗證的完整遊戲。按分數區間分組，各區間跨度不同。', estimate: '人數按匿名瀏覽器估算，不是帳號數。更換裝置或清除瀏覽器資料可能重複計數。', sharing: '分享匿名遊戲統計', privacy: '匿名瀏覽器識別碼和每局結束時的成績用於彙總統計。成績僅按區間分組儲存，無需帳號。',
  },
  ja: {
    title: 'みんなで育てるジャンプの庭', aboutTitle: 'いっしょに弾もう', players: 'プレイヤー · 推定', runs: 'プレイ回数', distribution: 'みんなの着地点', scores: 'スコアの範囲', games: 'プレイ回数', details: '詳しい数字を見る', loading: '小さな庭の便りを集めています…', unavailable: '庭の集計はひと休み。ゲームは遊べます。', empty: '生まれたての小さな庭。遊ぶたびに育ちます。', updated: '更新 {time}', stale: '最後に取得した集計 · {time}', caption: '確認を通過した終了済みゲームの集計です。スコアを区間ごとにまとめています。区間の幅は同じではありません。', estimate: '人数はアカウントではなく匿名ブラウザからの推定です。別の端末やデータ消去後のブラウザは再び数えられることがあります。', sharing: '匿名のゲーム統計を共有', privacy: '匿名のブラウザIDと終了したゲームのスコアから集計します。スコアは区間ごとにまとめて保存します。アカウントは不要です。',
  },
  ko: {
    title: '함께 가꾸는 작은 점프 정원', aboutTitle: '함께 통통 뛰어요', players: '플레이어 · 추정', runs: '플레이 횟수', distribution: '우리의 착지점', scores: '점수 구간', games: '플레이 횟수', details: '자세한 수치 보기', loading: '작은 정원의 소식을 모으는 중…', unavailable: '정원 집계는 잠시 쉬어요. 게임은 즐길 수 있어요.', empty: '새로운 작은 정원이에요. 한 판마다 자라나요.', updated: '{time} 업데이트', stale: '마지막으로 확인한 집계 · {time}', caption: '검증을 통과한 완료된 게임입니다. 점수를 구간별로 묶었으며 구간의 너비는 서로 다릅니다.', estimate: '계정이 아닌 익명 브라우저로 인원을 추정합니다. 다른 기기나 브라우저 데이터 삭제 후에는 다시 집계될 수 있어요.', sharing: '익명 게임 통계 공유', privacy: '익명 브라우저 ID와 게임 종료 시 점수를 모아 집계해요. 점수는 구간별로 묶어 저장하며 계정은 필요 없어요.',
  },
  es: {
    title: 'Un pequeño jardín de saltos', aboutTitle: 'Saltamos juntos', players: 'Jugadores · estimación', runs: 'Partidas jugadas', distribution: 'Dónde aterrizamos', scores: 'Rangos de puntos', games: 'Partidas', details: 'Ver las cifras', loading: 'Reuniendo nuestro pequeño jardín…', unavailable: 'El jardín descansa. Tu partida está lista.', empty: 'Un jardín nuevo. Cada partida lo ayuda a crecer.', updated: 'Actualizado: {time}', stale: 'Últimos totales disponibles · {time}', caption: 'Partidas terminadas que superaron la verificación. Los puntos se agrupan en rangos de distinta amplitud.', estimate: 'Los jugadores son navegadores anónimos, no cuentas. Otro dispositivo o borrar los datos puede volver a contar.', sharing: 'Compartir estadísticas anónimas', privacy: 'Un identificador anónimo del navegador y los puntos de las partidas terminadas forman estos totales. Los puntos se guardan agrupados por rangos. No necesitas cuenta.',
  },
  fr: {
    title: 'Un petit jardin de rebonds', aboutTitle: 'On rebondit ensemble', players: 'Joueurs · estimation', runs: 'Parties jouées', distribution: 'Nos petits atterrissages', scores: 'Tranches de scores', games: 'Parties', details: 'Voir les chiffres', loading: 'Notre petit jardin prend forme…', unavailable: 'Le jardin se repose. Le jeu vous attend.', empty: 'Un tout nouveau jardin. Chaque partie le fait grandir.', updated: 'Mis à jour : {time}', stale: 'Derniers totaux disponibles · {time}', caption: 'Parties terminées ayant passé la vérification. Les scores sont regroupés par tranches de largeurs différentes.', estimate: 'Les joueurs sont des navigateurs anonymes, pas des comptes. Un autre appareil ou des données effacées peuvent compter à nouveau.', sharing: 'Partager des statistiques anonymes', privacy: 'Un identifiant anonyme du navigateur et les scores des parties terminées forment ces totaux. Les scores sont conservés par tranches. Aucun compte requis.',
  },
  de: {
    title: 'Ein kleiner Garten voller Sprünge', aboutTitle: 'Gemeinsam hüpfen', players: 'Spielende · geschätzt', runs: 'Gespielte Runden', distribution: 'Unsere Landepunkte', scores: 'Punktebereiche', games: 'Runden', details: 'Zahlen ansehen', loading: 'Unser kleiner Garten wird gezählt…', unavailable: 'Die Statistik ruht. Dein Spiel ist bereit.', empty: 'Ein neuer kleiner Garten. Jede Runde lässt ihn wachsen.', updated: 'Aktualisiert: {time}', stale: 'Zuletzt verfügbare Werte · {time}', caption: 'Beendete Runden, die die Prüfung bestanden haben. Die Punkte sind in unterschiedlich breite Bereiche eingeteilt.', estimate: 'Gezählt werden anonyme Browser, keine Konten. Ein anderes Gerät oder gelöschte Browserdaten können erneut zählen.', sharing: 'Anonyme Spielstatistik teilen', privacy: 'Eine anonyme Browser-ID und die Punkte beendeter Runden ergeben diese Statistik. Punkte werden nur nach Bereichen gruppiert gespeichert. Kein Konto nötig.',
  },
  'pt-BR': {
    title: 'Um pequeno jardim de pulos', aboutTitle: 'Pulando juntos', players: 'Jogadores · estimativa', runs: 'Partidas jogadas', distribution: 'Onde aterrissamos', scores: 'Faixas de pontos', games: 'Partidas', details: 'Ver os números', loading: 'Reunindo nosso pequeno jardim…', unavailable: 'O jardim está descansando. Seu jogo está pronto.', empty: 'Um jardim novinho. Cada partida ajuda a crescer.', updated: 'Atualizado: {time}', stale: 'Últimos totais disponíveis · {time}', caption: 'Partidas concluídas que passaram pela verificação. Os pontos são agrupados em faixas de tamanhos diferentes.', estimate: 'Os jogadores são navegadores anônimos, não contas. Outro dispositivo ou a limpeza dos dados pode contar novamente.', sharing: 'Compartilhar estatísticas anônimas', privacy: 'Um identificador anônimo do navegador e os pontos das partidas concluídas formam estes totais. Os pontos são guardados por faixas. Não precisa de conta.',
  },
};
for (const dictionary of Object.values(statsMessages)) Object.freeze(dictionary);
Object.freeze(statsMessages);

export function statsText(locale, key, params = {}) {
  const dictionary = statsMessages[normalizeLocale(locale) || 'en'];
  const text = Object.hasOwn(dictionary, key) ? dictionary[key] : String(key);
  return text.replace(/\{([a-zA-Z]+)\}/g, (token, name) => Object.hasOwn(params, name) ? String(params[name]) : token);
}
