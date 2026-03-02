/**
 * Task Summarizer — uses OpenClaw Gateway to call LLM
 * for consolidating raw task fragments.
 */

import fs from "fs";
import path from "path";

const OPENCLAW_HOME =
  process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");

function getGroqConfig(): { baseUrl: string; apiKey: string; model: string } {
  try {
    const config = JSON.parse(
      fs.readFileSync(path.join(OPENCLAW_HOME, "openclaw.json"), "utf-8")
    );
    const provider = config.models?.providers?.groq;
    return {
      baseUrl: provider?.baseUrl || "https://api.groq.com/openai/v1",
      apiKey: provider?.apiKey || "",
      model: "llama-3.3-70b-versatile",
    };
  } catch {
    return { baseUrl: "https://api.groq.com/openai/v1", apiKey: "", model: "llama-3.3-70b-versatile" };
  }
}

interface RawTask {
  agentName: string;
  text: string;
  timestamp: string;
}

interface SummarizedTask {
  agentName: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  source: string[];
}

export async function summarizeTasks(
  rawTasks: RawTask[]
): Promise<SummarizedTask[]> {
  if (rawTasks.length === 0) return [];

  const cfg = getGroqConfig();

  // Group by agent
  const byAgent: Record<string, RawTask[]> = {};
  for (const t of rawTasks) {
    if (!byAgent[t.agentName]) byAgent[t.agentName] = [];
    byAgent[t.agentName].push(t);
  }

  const allSummarized: SummarizedTask[] = [];

  for (const [agentName, tasks] of Object.entries(byAgent)) {
    const taskList = tasks
      .map((t, i) => `${i + 1}. [${t.timestamp.slice(0, 16)}] ${t.text}`)
      .join("\n");

    const prompt = `你是任务归纳助手。下面是用户（Geralt）分配给团队成员「${agentName}」的原始对话片段。
请将这些碎片归纳为结构化的任务列表。

**规则：**
1. 相关的多条消息合并成一个任务
2. 每个任务用一句话概括（15-40字），要具体有行动力
3. 去掉闲聊、问候、确认类消息、纯技术讨论
4. 如果某条消息不像任务分配（比如问问题、打招呼、讨论），直接忽略
5. 标注优先级：high/medium/low
6. 只保留明确的任务指派，不要把每句话都当任务

**原始消息：**
${taskList}

**输出严格的 JSON 数组（不要其他任何内容，不要 markdown）：**
[{"title": "任务标题", "description": "详细说明", "priority": "medium", "sourceIndices": [1,2]}]

如果没有有效任务，返回 []`;

    try {
      // Use Gateway's OpenAI-compatible endpoint
      const res = await fetch(
        cfg.baseUrl + "/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + cfg.apiKey,
          },
          body: JSON.stringify({
            model: cfg.model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 2000,
            temperature: 0.3,
          }),
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!res.ok) {
        console.error(`[summarizer] Gateway error: ${res.status} ${await res.text().catch(() => "")}`);
        continue;
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";

      // Extract JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.log(`[summarizer] No JSON found in response for ${agentName}`);
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        title: string;
        description: string;
        priority: string;
        sourceIndices: number[];
      }>;

      for (const item of parsed) {
        if (!item.title || item.title.length < 5) continue;
        allSummarized.push({
          agentName,
          title: item.title,
          description: item.description || "",
          priority: (item.priority as any) || "medium",
          source: (item.sourceIndices || []).map(
            (i) => tasks[i - 1]?.text || ""
          ).filter(Boolean),
        });
      }
    } catch (err) {
      console.error(`[summarizer] error for ${agentName}:`, err);
    }
  }

  return allSummarized;
}
