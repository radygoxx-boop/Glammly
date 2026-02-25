// netlify/functions/questions.js
// Notion APIのAPIキーをサーバー側で保持し、ブラウザに漏れないようにする中継関数

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const DATABASE_ID   = process.env.NOTION_DATABASE_ID; // bba8e5642b4d4e288ba884e46aa49150

exports.handler = async () => {
  if (!NOTION_API_KEY || !DATABASE_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '環境変数が設定されていません' }),
    };
  }

  try {
    // Notionデータベースをクエリ（公開=trueの問題のみ取得）
    const res = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: {
          property: '公開',
          checkbox: { equals: true },
        },
        page_size: 100,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { statusCode: res.status, body: JSON.stringify({ error: err }) };
    }

    const data = await res.json();

    // Notionのプロパティ形式 → アプリが使いやすい形に変換
    const questions = data.results.map(page => {
      const p = page.properties;
      const getText = (prop) => prop?.rich_text?.[0]?.plain_text || prop?.title?.[0]?.plain_text || '';
      const getSelect = (prop) => prop?.select?.name || '';

      const choiceMap = { A: 0, B: 1, C: 2, D: 3 };
      const answerLetter = getSelect(p['正解']);

      return {
        q:       getText(p['問題文']),
        hint:    getText(p['ヒント']),
        choices: [
          getText(p['選択肢A']),
          getText(p['選択肢B']),
          getText(p['選択肢C']),
          getText(p['選択肢D']),
        ],
        answer:  choiceMap[answerLetter] ?? 0,
        explain: getText(p['解説']),
        unit:    getSelect(p['単元']),
        level:   getSelect(p['難易度']),
      };
    });

    // 単元ごとにグループ化
    const grouped = {};
    questions.forEach(q => {
      if (!q.unit) return;
      if (!grouped[q.unit]) grouped[q.unit] = [];
      grouped[q.unit].push(q);
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        // 5分キャッシュ（Notionへの過剰リクエスト防止）
        'Cache-Control': 'public, max-age=300',
      },
      body: JSON.stringify({ questions: grouped }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
