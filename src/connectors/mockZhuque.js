export class MockZhuqueConnector {
  async detectText(article) {
    const text = article.text || "";
    const aiScore = Math.min(0.99, Math.max(0.01, text.length > 200 ? 0.18 : 0.32));
    return {
      platform: "zhuque_ai",
      aiFeatureDetected: aiScore >= 0.5,
      aiFeatureRatio: Number(aiScore.toFixed(2)),
      summary: aiScore >= 0.5 ? "模拟检测：需要人工复核 AI 特征。" : "模拟检测：AI 特征占比较低。",
      checkedAt: new Date().toISOString()
    };
  }
}
